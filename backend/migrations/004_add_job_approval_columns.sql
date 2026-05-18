-- Migration 004: Add job approval columns to job_master
ALTER TABLE job_master
ADD COLUMN IF NOT EXISTS engineer_id INTEGER;

ALTER TABLE job_master
ADD COLUMN IF NOT EXISTS approved_by_id INTEGER;

ALTER TABLE job_master
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
