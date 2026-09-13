import math

from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import UploadBatch, UploadedProject
from ingestion import (
    parse_uploaded_file,
    analyze_dataframe,
    register_batch,
    get_batch,
    discard_batch,
)
from dataset_state import reload_dataset

router = APIRouter(prefix="/uploads", tags=["Data Ingestion"])

MAX_FILE_SIZE_MB = 25


def _clean(value):
    if value is None:
        return None
    try:
        if isinstance(value, float) and math.isnan(value):
            return None
    except TypeError:
        pass
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def _preview_rows(df, limit=50):
    rows = []
    for _, row in df.head(limit).iterrows():
        rows.append({
            "work_id": _clean(row.get("Work ID")),
            "description": _clean(row.get("Work Description")),
            "category": _clean(row.get("Category")),
            "state": _clean(row.get("State")),
            "house": _clean(row.get("House")),
            "constituency": _clean(row.get("Constituency")),
            "amount": _clean(row.get("Final Amount (₹)")),
            "risk_score": _clean(row.get("Risk_Score")),
            "risk_level": _clean(row.get("Risk_Level")),
            "risk_reasons": _clean(row.get("Risk_Reasons")),
        })
    return rows


@router.post("/analyze")
async def analyze_upload(file: UploadFile = File(...)):
    contents = await file.read()

    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            400, f"File too large ({size_mb:.1f} MB). Limit is {MAX_FILE_SIZE_MB} MB."
        )

    try:
        df = parse_uploaded_file(file.filename, contents)
        scored_df = analyze_dataframe(df)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(422, f"Could not process file: {exc}")

    source_type = file.filename.lower().rsplit(".", 1)[-1]
    upload_id = register_batch(file.filename, source_type, scored_df)

    risk_counts = scored_df["Risk_Level"].value_counts()

    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "row_count": len(scored_df),
        "rows_dropped_invalid": df.attrs.get("rows_dropped_invalid", 0),
        "risk_summary": {
            "high": int(risk_counts.get("HIGH", 0)),
            "medium": int(risk_counts.get("MEDIUM", 0)),
            "low": int(risk_counts.get("LOW", 0)),
        },
        "preview": _preview_rows(scored_df),
        "preview_truncated": len(scored_df) > 50,
    }


@router.get("/{upload_id}/preview")
def get_preview(upload_id: str, limit: int = 50, offset: int = 0):
    batch = get_batch(upload_id)
    if batch is None:
        raise HTTPException(404, "Upload not found — it may have expired, been committed, or been discarded.")

    df = batch["df"]
    page = df.iloc[offset: offset + limit]

    return {
        "upload_id": upload_id,
        "filename": batch["filename"],
        "total_rows": len(df),
        "offset": offset,
        "limit": limit,
        "rows": _preview_rows(page, limit=limit),
    }


@router.post("/{upload_id}/commit")
def commit_upload(upload_id: str, db: Session = Depends(get_db)):
    batch = get_batch(upload_id)
    if batch is None:
        raise HTTPException(404, "Upload not found, expired, or already committed.")

    df = batch["df"]
    risk_counts = df["Risk_Level"].value_counts()

    db_batch = UploadBatch(
        filename=batch["filename"],
        source_type=batch["source_type"],
        row_count=len(df),
        high_count=int(risk_counts.get("HIGH", 0)),
        medium_count=int(risk_counts.get("MEDIUM", 0)),
        low_count=int(risk_counts.get("LOW", 0)),
        committed=True,
    )
    db.add(db_batch)
    db.flush()

    records = [
        UploadedProject(
            batch_id=db_batch.id,
            work_id=str(_clean(row.get("Work ID"))),
            description=_clean(row.get("Work Description")),
            category=_clean(row.get("Category")),
            mp_name=_clean(row.get("MP Name")),
            constituency=_clean(row.get("Constituency")),
            state=_clean(row.get("State")),
            house=_clean(row.get("House")),
            final_amount=_clean(row.get("Final Amount (₹)")),
            has_images=bool(row.get("Has Images", False)),
            risk_score=int(row.get("Risk_Score", 0) or 0),
            risk_level=_clean(row.get("Risk_Level")),
            risk_reasons=_clean(row.get("Risk_Reasons")),
            peer_median=_clean(row.get("peer_median")),
            amount_ratio_to_peer_median=_clean(row.get("Amount_Ratio_to_Peer_Median")),
        )
        for _, row in df.iterrows()
    ]

    db.bulk_save_objects(records)
    db.commit()

    discard_batch(upload_id)

    # Sync live in-memory dataset across all tabs
    reload_dataset()

    return {
        "status": "saved",
        "upload_id": upload_id,
        "batch_id": str(db_batch.id),
        "rows_saved": len(records),
    }


@router.delete("/{upload_id}")
def discard_upload(upload_id: str):
    batch = get_batch(upload_id)
    if batch is None:
        raise HTTPException(404, "Upload not found.")
    discard_batch(upload_id)
    return {"status": "discarded", "upload_id": upload_id}


@router.get("/history")
def upload_history(db: Session = Depends(get_db)):
    batches = (
        db.query(UploadBatch)
        .order_by(UploadBatch.uploaded_at.desc())
        .limit(50)
        .all()
    )
    return {
        "batches": [
            {
                "batch_id": str(b.id),
                "filename": b.filename,
                "uploaded_at": b.uploaded_at.isoformat(),
                "row_count": b.row_count,
                "high": b.high_count,
                "medium": b.medium_count,
                "low": b.low_count,
            }
            for b in batches
        ]
    }