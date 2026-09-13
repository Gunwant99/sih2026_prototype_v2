"""
backend/dataset_state.py
Single authoritative in-memory data store.
Unifies baseline CSV data with committed rows from PostgreSQL.
"""

from pathlib import Path
import pandas as pd
from sqlalchemy.orm import Session

from database import SessionLocal
from models import UploadedProject
from risk_engine_v4_optimized import load_v4_data, prepare_scored_dataframe

BASE_DIR = Path(__file__).resolve().parent.parent
V4_DATA_PATH = BASE_DIR / "data" / "investigation_projects_v4.csv"

# Global live dataset reference
LIVE_DF = pd.DataFrame()


def _load_base_dataframe() -> pd.DataFrame:
    if V4_DATA_PATH.exists():
        return load_v4_data(V4_DATA_PATH)
    return pd.DataFrame()


def _load_committed_db_dataframe(db: Session) -> pd.DataFrame:
    rows = db.query(UploadedProject).all()
    if not rows:
        return pd.DataFrame()

    data = [
        {
            "Work ID": int(r.work_id) if str(r.work_id).isdigit() else r.work_id,
            "Work Description": r.description or "",
            "Category": r.category or "Unspecified",
            "MP Name": r.mp_name or "Unknown",
            "Constituency": r.constituency or "Unknown",
            "State": r.state or "Unknown",
            "House": r.house or "Unknown",
            "Final Amount (₹)": float(r.final_amount or 0),
            "Has Images": bool(r.has_images),
            "Financial_Reconciliation_Flag": "Unreconciled / Field Ingest",
            "Timeline_Flag": "Chronology consistent",
            "Data_Quality_Flag": "Field Ingestion Record",
            "Pending_Payment_Count": 0,
            "Expenditure_Total": float(r.final_amount or 0),
            "Expenditure_minus_Final": 0,
            "Sanctioned Amount (₹)": float(r.final_amount or 0),
            "Recommended Amount (₹)": float(r.final_amount or 0),
        }
        for r in rows
    ]
    return pd.DataFrame(data)


def reload_dataset() -> pd.DataFrame:
    global LIVE_DF
    base_df = _load_base_dataframe()

    db = SessionLocal()
    try:
        db_df = _load_committed_db_dataframe(db)
    finally:
        db.close()

    if not db_df.empty:
        # DB uploads take precedence if identical Work IDs exist
        merged = pd.concat([base_df, db_df], ignore_index=True)
        merged["_wid_num"] = pd.to_numeric(merged["Work ID"], errors="coerce")
        merged = merged.drop_duplicates(subset=["_wid_num"], keep="last").drop(columns=["_wid_num"])
    else:
        merged = base_df

    # Vectorized score recalculation across unified data
    scored = prepare_scored_dataframe(merged)
    scored["Work ID"] = pd.to_numeric(scored["Work ID"], errors="coerce")
    LIVE_DF = scored
    return LIVE_DF


def get_dataset() -> pd.DataFrame:
    global LIVE_DF
    if LIVE_DF.empty:
        return reload_dataset()
    return LIVE_DF