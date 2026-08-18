CREATE TABLE pilot_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  exchange_student_confirmed INTEGER NOT NULL CHECK (exchange_student_confirmed = 1),
  housing TEXT NOT NULL CHECK (housing IN ('dorm', 'off')),
  arrival_date TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  applicant_name TEXT NOT NULL CHECK (length(applicant_name) BETWEEN 1 AND 120),
  applicant_email TEXT NOT NULL CHECK (length(applicant_email) BETWEEN 3 AND 320),
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_pilot_applications_public_id
  ON pilot_applications(public_id);

CREATE INDEX idx_pilot_applications_email
  ON pilot_applications(applicant_email);
