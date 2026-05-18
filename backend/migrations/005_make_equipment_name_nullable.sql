-- Migration 005: Make equipment_name nullable in job_master when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_master'
      AND column_name = 'equipment_name'
  ) THEN
    ALTER TABLE job_master ALTER COLUMN equipment_name DROP NOT NULL;
  END IF;
END$$;
