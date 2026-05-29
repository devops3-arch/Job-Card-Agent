-- Migration 009: Add soft delete metadata to job_master and normalize status default
ALTER TABLE job_master
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE job_master
  ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE job_master
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

ALTER TABLE job_master
  ALTER COLUMN status SET DEFAULT 'DRAFT';

CREATE INDEX IF NOT EXISTS job_master_deleted_at_idx ON job_master(deleted_at);
