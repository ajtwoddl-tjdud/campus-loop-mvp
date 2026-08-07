from fastapi import APIRouter, HTTPException, status

from app.database import SessionDep
from app.schemas.reservation import ReservationCreate, ReservationPublic
from app.services.reservations import InvalidCatalogItemError, create_reservation

router = APIRouter(prefix="/api/v1/reservations", tags=["reservations"])


@router.post("", status_code=status.HTTP_201_CREATED)
def create(payload: ReservationCreate, session: SessionDep) -> ReservationPublic:
    try:
        return create_reservation(payload, session)
    except InvalidCatalogItemError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
