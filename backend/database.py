"""
Database connection layer for the MPLADS ingestion feature.

Reads the connection string from the DATABASE_URL environment variable
(loaded from a local .env file that is NOT committed to git). Falls back
to a sensible local default only for convenience during development.
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:gunwant@localhost:5432/mplads_db",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables if they don't exist yet. Called once at app startup."""
    import models  # noqa: F401  (import registers the models on Base)
    Base.metadata.create_all(bind=engine)