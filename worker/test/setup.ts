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
      created_at TEXT NOT NULL
    )
  `).run()
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM pilot_applications').run()
})
