CREATE TABLE rental_intakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 120),
  customer_email TEXT NOT NULL CHECK (length(customer_email) BETWEEN 3 AND 320),
  secondary_contact TEXT CHECK (secondary_contact IS NULL OR length(secondary_contact) BETWEEN 1 AND 160),
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_rental_intakes_public_id
  ON rental_intakes(public_id);

CREATE INDEX idx_rental_intakes_email
  ON rental_intakes(customer_email);
