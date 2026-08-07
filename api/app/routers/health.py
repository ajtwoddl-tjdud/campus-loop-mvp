from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1", tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


@router.get("/health")
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="campus-loop-api")
