# Campus Loop API

FastAPI and SQLite backend for Campus Loop reservations.

## Current boundary

- Provides an unauthenticated health endpoint and reservation creation endpoint.
- Validates requests with Pydantic, calculates catalog totals in the service, and persists reservations through a repository.
- Stores reservation contact data in SQLite but does not expose public read endpoints.
- Does not implement authentication, payments, messaging, or administrator access.
- Allows only explicitly configured browser origins through CORS.

## Local development

```bash
uv sync --dev
uv run fastapi dev
```

```bash
uv run pytest
uv run ruff check .
```

The default database is `data/campus_loop.db`. Set `DATABASE_URL` to override it. SQLite is configured with foreign keys, WAL journal mode, and a five-second busy timeout.

## Endpoints

- `GET /api/v1/health`
- `POST /api/v1/reservations`

The reservation response intentionally omits contact details. Catalog prices and generated reservation IDs are server-controlled rather than trusted from the browser.

## Planned request flow

```text
React web -> Pydantic request validation -> reservation service -> repository -> SQLite
          <- typed response model       <- business result      <- persisted record
```

The current application creates its initial SQLite tables on startup. Add an explicit migration workflow before the first schema change or production rollout. Authentication must be implemented before adding reservation list, detail, update, or deletion endpoints.
