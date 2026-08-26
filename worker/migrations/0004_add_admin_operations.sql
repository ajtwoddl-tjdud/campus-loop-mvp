ALTER TABLE rental_intakes ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (fulfillment_status IN ('pending', 'ready', 'collected', 'returned', 'cancelled'));
ALTER TABLE rental_intakes ADD COLUMN refund_status TEXT NOT NULL DEFAULT 'not_due'
  CHECK (refund_status IN ('not_due', 'pending', 'completed', 'failed'));
ALTER TABLE rental_intakes ADD COLUMN admin_notes TEXT NOT NULL DEFAULT ''
  CHECK (length(admin_notes) <= 2000);
ALTER TABLE rental_intakes ADD COLUMN updated_at TEXT;

CREATE INDEX idx_rental_intakes_operations
  ON rental_intakes(fulfillment_status, refund_status, created_at DESC);

CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_public_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('update')),
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_admin_audit_log_created_at
  ON admin_audit_log(created_at DESC);

CREATE INDEX idx_admin_audit_log_intake
  ON admin_audit_log(intake_public_id, created_at DESC);

CREATE TABLE admin_login_attempts (
  key_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);
