"""
ORM models for officer-uploaded data.

Two tables:
  - upload_batches   one row per file an officer analyzed/saved
  - uploaded_projects one row per project record inside that file
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
)
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    source_type = Column(String, nullable=False)  # "csv" or "pdf"
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    row_count = Column(Integer, default=0)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    committed = Column(Boolean, default=False)


class UploadedProject(Base):
    __tablename__ = "uploaded_projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("upload_batches.id"), index=True)

    work_id = Column(String, index=True)
    description = Column(Text)
    category = Column(String)
    mp_name = Column(String)
    constituency = Column(String)
    state = Column(String, index=True)
    house = Column(String)
    final_amount = Column(Float)
    has_images = Column(Boolean, default=False)

    risk_score = Column(Integer)
    risk_level = Column(String, index=True)
    risk_reasons = Column(Text)
    peer_median = Column(Float)
    amount_ratio_to_peer_median = Column(Float)