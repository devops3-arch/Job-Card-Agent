-- Add part_number column to job_parts table
ALTER TABLE job_parts ADD COLUMN IF NOT EXISTS part_number TEXT;
