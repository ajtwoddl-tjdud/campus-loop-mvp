import { env } from 'cloudflare:workers'
import { beforeAll, beforeEach } from 'vitest'

beforeAll(async () => {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS pilot_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      exchange_student_confirmed INTEGER NOT NULL,
      housing TEXT NOT NULL,
      arrival_date TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      applicant_name TEXT NOT NULL,
      applicant_email TEXT NOT NULL,
      consent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      checkout_token_hash TEXT,
      paypal_order_id TEXT,
      paypal_capture_id TEXT,
      payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'created', 'completed')),
      paid_at TEXT,
      discord_message_id TEXT
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS paypal_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      received_at TEXT NOT NULL
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS rental_intakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      secondary_contact TEXT,
      consent_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run()
  const rentalColumns = await env.DB.prepare('PRAGMA table_info(rental_intakes)').all<{ name: string }>()
  const existingColumns = new Set(rentalColumns.results.map((column) => column.name))
  const missingColumns = [
    ['checkout_token_hash', 'TEXT'],
    ['paypal_order_id', 'TEXT'],
    ['paypal_capture_id', 'TEXT'],
    ['payment_status', "TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'created', 'completed'))"],
    ['paid_at', 'TEXT'],
    ['discord_message_id', 'TEXT'],
    ['fulfillment_status', "TEXT NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'ready', 'collected', 'returned', 'cancelled'))"],
    ['refund_status', "TEXT NOT NULL DEFAULT 'not_due' CHECK (refund_status IN ('not_due', 'pending', 'completed', 'failed'))"],
    ['admin_notes', "TEXT NOT NULL DEFAULT '' CHECK (length(admin_notes) <= 2000)"],
    ['updated_at', 'TEXT'],
  ]
  for (const [name, definition] of missingColumns) {
    if (!existingColumns.has(name)) {
      await env.DB.prepare(`ALTER TABLE rental_intakes ADD COLUMN ${name} ${definition}`).run()
    }
  }
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intake_public_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('update')),
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      key_hash TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      failed_count INTEGER NOT NULL,
      locked_until INTEGER NOT NULL DEFAULT 0
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_paypal_tests (
      id TEXT PRIMARY KEY,
      paypal_order_id TEXT NOT NULL UNIQUE,
      paypal_capture_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'completed')),
      amount TEXT NOT NULL DEFAULT '1.00' CHECK (amount = '1.00'),
      currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      paid_at TEXT
    )
  `).run()
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM pilot_applications').run()
  await env.DB.prepare('DELETE FROM rental_intakes').run()
  await env.DB.prepare('DELETE FROM paypal_webhook_events').run()
  await env.DB.prepare('DELETE FROM admin_audit_log').run()
  await env.DB.prepare('DELETE FROM admin_login_attempts').run()
  await env.DB.prepare('DELETE FROM admin_paypal_tests').run()
})
