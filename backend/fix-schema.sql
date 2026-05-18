-- FIX FOR JOB MASTER TABLE - Make equipment_name optional
-- This fixes the POST /jobs failure when equipment_name is not provided
-- NOTE: This file is legacy/manual. Prefer npm run migrate going forward.

ALTER TABLE job_master
ALTER COLUMN equipment_name DROP NOT NULL;

-- Optional: Set default empty string if you prefer
-- ALTER TABLE job_master
-- ALTER COLUMN equipment_name SET DEFAULT '';

-- Add authentication-related columns
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS engineer_id INTEGER;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS approved_by_id INTEGER;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

-- Add user signature metadata for approval workflows
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_uploaded_at TIMESTAMP;

-- Add approved document governance table
CREATE TABLE IF NOT EXISTS approved_documents (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES job_master(id) ON DELETE CASCADE,
  pdf_url TEXT,
  pdf_hash TEXT,
  generated_by INTEGER REFERENCES users(id),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_locked BOOLEAN DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  approval_snapshot JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS approved_documents_job_id_idx ON approved_documents(job_id);
CREATE INDEX IF NOT EXISTS approved_documents_generated_at_idx ON approved_documents(generated_at);
