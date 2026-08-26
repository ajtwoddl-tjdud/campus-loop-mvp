CREATE TABLE admin_paypal_tests (
  id TEXT PRIMARY KEY,
  paypal_order_id TEXT NOT NULL UNIQUE,
  paypal_capture_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'completed')),
  amount TEXT NOT NULL DEFAULT '1.00'
    CHECK (amount = '1.00'),
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency = 'USD'),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE INDEX idx_admin_paypal_tests_created_at
  ON admin_paypal_tests(created_at DESC);
