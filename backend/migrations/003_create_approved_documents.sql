-- Migration 003: Create approved_documents table and indexes
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
