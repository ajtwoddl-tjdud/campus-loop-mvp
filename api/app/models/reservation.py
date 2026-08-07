from datetime import UTC, date, datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


class Reservation(SQLModel, table=True):
    __tablename__ = "reservations"

    id: int | None = Field(default=None, primary_key=True)
    public_id: str = Field(index=True, unique=True, max_length=32)
    campus: str = Field(max_length=16)
    housing: str = Field(max_length=16)
    stay_type: str = Field(max_length=16)
    start_date: date
    end_date: date
    storage_interested: bool = False
    storage_start_date: date | None = None
    storage_end_date: date | None = None
    storage_boxes: int = 0
    rental_ids: list[str] = Field(sa_column=Column(JSON, nullable=False))
    purchase_ids: list[str] = Field(sa_column=Column(JSON, nullable=False))
    pickup_date: date
    pickup_time: str = Field(max_length=32)
    contact_name: str = Field(max_length=120)
    contact_email: str = Field(index=True, max_length=320)
    contact_line: str | None = Field(default=None, max_length=120)
    consent_at: datetime
    rental_total: int = Field(ge=0)
    purchase_total: int = Field(ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
