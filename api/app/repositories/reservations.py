from sqlmodel import Session

from app.models.reservation import Reservation


class ReservationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, reservation: Reservation) -> Reservation:
        self.session.add(reservation)
        self.session.commit()
        self.session.refresh(reservation)
        return reservation
