from datetime import UTC, datetime
from uuid import uuid4

from sqlmodel import Session

from app.catalog import PURCHASE_PRICES, RENTAL_PRICES
from app.models.reservation import Reservation
from app.repositories.reservations import ReservationRepository
from app.schemas.reservation import (
    PickupInput,
    ProfileInput,
    ReservationCreate,
    ReservationPublic,
    ReservationTotals,
    StorageInput,
)


class InvalidCatalogItemError(ValueError):
    pass


def _total(item_ids: list[str], prices: dict[str, int], item_type: str) -> int:
    unknown = sorted(set(item_ids) - prices.keys())
    if unknown:
        raise InvalidCatalogItemError(f"Unsupported {item_type} item IDs: {', '.join(unknown)}")
    return sum(prices[item_id] for item_id in item_ids)


def create_reservation(payload: ReservationCreate, session: Session) -> ReservationPublic:
    rental_total = _total(payload.rental_ids, RENTAL_PRICES, "rental")
    purchase_total = _total(payload.purchase_ids, PURCHASE_PRICES, "purchase")
    now = datetime.now(UTC)
    storage = payload.storage

    reservation = Reservation(
        public_id=f"CL-{uuid4().hex[:12].upper()}",
        campus=payload.profile.campus.value,
        housing=payload.profile.housing.value,
        stay_type=payload.profile.stay_type.value,
        start_date=payload.profile.start_date,
        end_date=payload.profile.end_date,
        storage_interested=storage.interested,
        storage_start_date=storage.start_date if storage.interested else None,
        storage_end_date=storage.end_date if storage.interested else None,
        storage_boxes=storage.boxes if storage.interested else 0,
        rental_ids=payload.rental_ids,
        purchase_ids=payload.purchase_ids,
        pickup_date=payload.pickup.date,
        pickup_time=payload.pickup.time,
        contact_name=payload.contact.name.strip(),
        contact_email=str(payload.contact.email).lower(),
        contact_line=payload.contact.line.strip() if payload.contact.line else None,
        consent_at=now,
        rental_total=rental_total,
        purchase_total=purchase_total,
        created_at=now,
    )
    saved = ReservationRepository(session).add(reservation)
    created_at = saved.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)

    return ReservationPublic(
        id=saved.public_id,
        profile=ProfileInput(
            campus=saved.campus,
            housing=saved.housing,
            stay_type=saved.stay_type,
            start_date=saved.start_date,
            end_date=saved.end_date,
        ),
        storage=StorageInput(
            interested=saved.storage_interested,
            start_date=saved.storage_start_date,
            end_date=saved.storage_end_date,
            boxes=saved.storage_boxes,
        ),
        rental_ids=saved.rental_ids,
        purchase_ids=saved.purchase_ids,
        pickup=PickupInput(date=saved.pickup_date, time=saved.pickup_time),
        totals=ReservationTotals(rental=saved.rental_total, purchase=saved.purchase_total),
        created_at=created_at,
    )
