-- Migration 008: Add manager_id column to job_master
ALTER TABLE job_master
ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Create an index for manager_id to optimize job filtering
CREATE INDEX IF NOT EXISTS job_master_manager_id_idx ON job_master(manager_id);
