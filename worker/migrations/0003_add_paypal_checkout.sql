ALTER TABLE rental_intakes ADD COLUMN checkout_token_hash TEXT;
ALTER TABLE rental_intakes ADD COLUMN paypal_order_id TEXT;
ALTER TABLE rental_intakes ADD COLUMN paypal_capture_id TEXT;
ALTER TABLE rental_intakes ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'created', 'completed'));
ALTER TABLE rental_intakes ADD COLUMN paid_at TEXT;
ALTER TABLE rental_intakes ADD COLUMN discord_message_id TEXT;

CREATE UNIQUE INDEX idx_rental_intakes_paypal_order_id
  ON rental_intakes(paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;

CREATE UNIQUE INDEX idx_rental_intakes_paypal_capture_id
  ON rental_intakes(paypal_capture_id)
  WHERE paypal_capture_id IS NOT NULL;

CREATE TABLE paypal_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL
);
