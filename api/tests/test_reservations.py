from copy import deepcopy

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.reservation import Reservation

VALID_RESERVATION = {
    "profile": {
        "campus": "NTU",
        "housing": "dorm",
        "stayType": "semester",
        "startDate": "2026-09-01",
        "endDate": "2027-01-15",
    },
    "storage": {
        "interested": False,
        "startDate": "2027-01-16",
        "endDate": "2027-02-15",
        "boxes": 2,
    },
    "rentalIds": ["rack", "hangers"],
    "purchaseIds": ["bedding"],
    "pickup": {"date": "2026-09-01", "time": "10:00–12:00"},
    "contact": {
        "name": "  Campus Student  ",
        "email": "STUDENT@example.com",
        "line": "campus-student",
        "agree": True,
    },
}


def test_create_reservation_persists_server_calculated_totals(
    client: TestClient,
    session: Session,
) -> None:
    response = client.post("/api/v1/reservations", json=VALID_RESERVATION)

    assert response.status_code == 201
    body = response.json()
    assert body["id"].startswith("CL-")
    assert body["totals"] == {"rental": 360, "purchase": 1250}
    assert body["rentalIds"] == ["rack", "hangers"]
    assert body["createdAt"].endswith("Z")
    assert "contact" not in body

    saved = session.exec(select(Reservation)).one()
    assert saved.public_id == body["id"]
    assert saved.contact_name == "Campus Student"
    assert saved.contact_email == "student@example.com"
    assert saved.rental_total == 360
    assert saved.purchase_total == 1250


def test_create_reservation_rejects_unknown_catalog_item(
    client: TestClient,
    session: Session,
) -> None:
    payload = deepcopy(VALID_RESERVATION)
    payload["rentalIds"] = ["unknown-item"]

    response = client.post("/api/v1/reservations", json=payload)

    assert response.status_code == 422
    assert response.json() == {"detail": "Unsupported rental item IDs: unknown-item"}
    assert session.exec(select(Reservation)).first() is None


def test_create_reservation_requires_consent(client: TestClient) -> None:
    payload = deepcopy(VALID_RESERVATION)
    payload["contact"]["agree"] = False

    response = client.post("/api/v1/reservations", json=payload)

    assert response.status_code == 422


def test_create_reservation_rejects_unavailable_pickup_slot(client: TestClient) -> None:
    payload = deepcopy(VALID_RESERVATION)
    payload["pickup"] = {"date": "2026-09-04", "time": "18:00–20:00"}

    response = client.post("/api/v1/reservations", json=payload)

    assert response.status_code == 422


def test_create_reservation_rejects_pickup_outside_rental_period(client: TestClient) -> None:
    payload = deepcopy(VALID_RESERVATION)
    payload["profile"]["startDate"] = "2026-10-01"
    payload["profile"]["endDate"] = "2027-01-15"

    response = client.post("/api/v1/reservations", json=payload)

    assert response.status_code == 422


def test_create_reservation_bounds_item_input(client: TestClient) -> None:
    payload = deepcopy(VALID_RESERVATION)
    payload["rentalIds"] = [f"item-{index}" for index in range(7)]

    response = client.post("/api/v1/reservations", json=payload)

    assert response.status_code == 422


def test_reservation_details_are_not_publicly_readable(client: TestClient) -> None:
    response = client.get("/api/v1/reservations/CL-NOT-PUBLIC")

    assert response.status_code == 404
