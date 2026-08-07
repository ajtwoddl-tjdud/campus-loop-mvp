from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from pydantic.alias_generators import to_camel

from app.catalog import PICKUP_DATES, PICKUP_TIMES, PURCHASE_PRICES, RENTAL_PRICES

ItemId = Annotated[str, Field(min_length=1, max_length=32)]


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class Campus(StrEnum):
    NTU = "NTU"
    NTNU = "NTNU"


class Housing(StrEnum):
    DORM = "dorm"
    OFF = "off"


class StayType(StrEnum):
    SHORT = "short"
    SEMESTER = "semester"
    LONG = "long"


class ProfileInput(ApiModel):
    campus: Campus
    housing: Housing
    stay_type: StayType
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_dates(self) -> "ProfileInput":
        if self.end_date <= self.start_date:
            raise ValueError("endDate must be after startDate")
        return self


class StorageInput(ApiModel):
    interested: bool
    start_date: date | None = None
    end_date: date | None = None
    boxes: int = Field(default=0, ge=0, le=20)

    @model_validator(mode="after")
    def validate_interest_details(self) -> "StorageInput":
        if not self.interested:
            return self
        if self.start_date is None or self.end_date is None:
            raise ValueError("storage dates are required when interested is true")
        if self.end_date <= self.start_date:
            raise ValueError("storage endDate must be after startDate")
        if self.boxes < 1:
            raise ValueError("boxes must be at least 1 when interested is true")
        return self


class PickupInput(ApiModel):
    date: date
    time: str = Field(min_length=1, max_length=32)


class ContactInput(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    line: str | None = Field(default=None, max_length=120)
    agree: bool

    @model_validator(mode="after")
    def require_consent(self) -> "ContactInput":
        if not self.agree:
            raise ValueError("reservation consent is required")
        return self


class ReservationCreate(ApiModel):
    profile: ProfileInput
    storage: StorageInput
    rental_ids: list[ItemId] = Field(min_length=1, max_length=len(RENTAL_PRICES))
    purchase_ids: list[ItemId] = Field(default_factory=list, max_length=len(PURCHASE_PRICES))
    pickup: PickupInput
    contact: ContactInput

    @model_validator(mode="after")
    def require_unique_items(self) -> "ReservationCreate":
        if len(self.rental_ids) != len(set(self.rental_ids)):
            raise ValueError("rentalIds must not contain duplicates")
        if len(self.purchase_ids) != len(set(self.purchase_ids)):
            raise ValueError("purchaseIds must not contain duplicates")
        if self.pickup.date.isoformat() not in PICKUP_DATES[self.profile.campus.value]:
            raise ValueError("pickup date is not available for the selected campus")
        if self.pickup.time not in PICKUP_TIMES:
            raise ValueError("pickup time is not available")
        if not self.profile.start_date <= self.pickup.date <= self.profile.end_date:
            raise ValueError("pickup date must be within the rental period")
        return self


class ReservationTotals(ApiModel):
    rental: int
    purchase: int


class ReservationPublic(ApiModel):
    id: str
    profile: ProfileInput
    storage: StorageInput
    rental_ids: list[str]
    purchase_ids: list[str]
    pickup: PickupInput
    totals: ReservationTotals
    created_at: datetime
