"""
Core ingestion logic: turn an officer's uploaded CSV/PDF into a dataframe
that matches the schema the existing V4 risk engine expects, score it with
that SAME engine (risk_engine_v4_optimized.prepare_scored_dataframe), and
hold the scored result in memory until the officer decides to keep it.

Nothing here touches Postgres — see upload_routes.py for that step.
"""

import io
import uuid
from datetime import datetime

import pandas as pd

from risk_engine_v4_optimized import prepare_scored_dataframe

# -------------------------------------------------------------------
# In-memory holding area for "analyzed but not yet committed" uploads.
#
# NOTE: this is process-local memory, not a database. It's cleared on
# restart and won't work across multiple backend workers/replicas.
# That's fine for a single-officer / single-process deployment; if you
# scale to multiple workers, swap this for Redis or a scratch Postgres
# table keyed by upload_id instead.
# -------------------------------------------------------------------
UPLOAD_CACHE = {}

# Officer files won't use our exact internal column names — map common
# variants onto the canonical schema the risk engine expects. Add more
# aliases here as you see real-world officer files.
COLUMN_ALIASES = {
    "work id": "Work ID", "workid": "Work ID", "work_id": "Work ID", "id": "Work ID",
    "project id": "Work ID", "project_id": "Work ID",

    "description": "Work Description", "work description": "Work Description",
    "project description": "Work Description", "details": "Work Description",

    "category": "Category", "type": "Category",

    "mp name": "MP Name", "mp_name": "MP Name", "member of parliament": "MP Name",

    "constituency": "Constituency",

    "state": "State", "state/ut": "State",

    "house": "House",

    "amount": "Final Amount (₹)", "final amount": "Final Amount (₹)",
    "final amount (₹)": "Final Amount (₹)", "amount (rs)": "Final Amount (₹)",
    "amount (inr)": "Final Amount (₹)", "sanctioned amount": "Final Amount (₹)",

    "has images": "Has Images", "images": "Has Images", "has_images": "Has Images",
}

REQUIRED_COLUMNS = ["Work ID", "State", "House", "Category", "Final Amount (₹)"]


def _standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {}
    for col in df.columns:
        key = str(col).strip().lower()
        if key in COLUMN_ALIASES:
            rename_map[col] = COLUMN_ALIASES[key]
    return df.rename(columns=rename_map)


def _read_csv(file_bytes: bytes) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(file_bytes))


def _read_pdf(file_bytes: bytes) -> pd.DataFrame:
    """
    Extract tabular data from a text-based PDF (e.g. a report exported
    from another government system). Scanned/image-only PDFs have no
    extractable table structure and are rejected with a clear message
    rather than silently returning nothing.
    """
    import pdfplumber

    tables = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                if not table or len(table) < 2:
                    continue
                header, *rows = table
                tables.append(pd.DataFrame(rows, columns=header))

    if not tables:
        raise ValueError(
            "No tables could be detected in this PDF. Scanned/image-only "
            "PDFs aren't supported yet — export the data as CSV, or as a "
            "text-based (not scanned) PDF, and try again."
        )

    return pd.concat(tables, ignore_index=True)


def parse_uploaded_file(filename: str, file_bytes: bytes) -> pd.DataFrame:
    """Read + normalize an uploaded CSV or PDF into the canonical schema."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "csv":
        df = _read_csv(file_bytes)
    elif ext == "pdf":
        df = _read_pdf(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: .{ext or '?'}. Upload a .csv or .pdf file.")

    df = _standardize_columns(df)

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            "The uploaded file is missing required column(s): "
            + ", ".join(missing)
            + ". Detected columns: "
            + ", ".join(str(c) for c in df.columns)
        )

    if "Has Images" not in df.columns:
        df["Has Images"] = False

    df["Work ID"] = pd.to_numeric(df["Work ID"], errors="coerce")
    df["Final Amount (₹)"] = (
        df["Final Amount (₹)"]
        .astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("₹", "", regex=False)
        .str.strip()
    )
    df["Final Amount (₹)"] = pd.to_numeric(df["Final Amount (₹)"], errors="coerce")

    before = len(df)
    df = df.dropna(subset=["Work ID", "Final Amount (₹)"])
    dropped = before - len(df)
    if dropped:
        df.attrs["rows_dropped_invalid"] = dropped

    if df.empty:
        raise ValueError(
            "No usable rows were found after parsing — check that Work ID "
            "and Amount columns contain numeric values."
        )

    return df


def analyze_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Score the uploaded rows with the exact same V4 risk engine used
    on the official 116k-project dataset, so results are apples-to-apples."""
    return prepare_scored_dataframe(df)


def register_batch(filename: str, source_type: str, scored_df: pd.DataFrame) -> str:
    upload_id = str(uuid.uuid4())
    UPLOAD_CACHE[upload_id] = {
        "filename": filename,
        "source_type": source_type,
        "created_at": datetime.utcnow(),
        "df": scored_df,
    }
    return upload_id


def get_batch(upload_id: str):
    return UPLOAD_CACHE.get(upload_id)


def discard_batch(upload_id: str):
    UPLOAD_CACHE.pop(upload_id, None)