import os
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "https://campus-loop.pages.dev",
)


def cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS")
    if configured is None:
        return list(DEFAULT_CORS_ORIGINS)

    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def database_url() -> str:
    configured = os.getenv("DATABASE_URL")
    if configured:
        return configured

    return f"sqlite:///{API_ROOT / 'data' / 'campus_loop.db'}"
