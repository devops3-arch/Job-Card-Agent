-- Migration 013: Fix column types and add additional job fields

-- Fix complaint field to TEXT (255 chars is too short)
ALTER TABLE job_master 
  ALTER COLUMN complaint_issue_description TYPE TEXT;

-- Fix meter_reading to NUMERIC for decimal support
ALTER TABLE job_master 
  ALTER COLUMN meter_reading TYPE NUMERIC(10,2);

-- Fix last_service_hours to NUMERIC for decimal support
ALTER TABLE job_master 
  ALTER COLUMN last_service_hours TYPE NUMERIC(10,2);

-- Add missing total_travel_hours and total_work_hours columns and additional metadata
ALTER TABLE job_master
  ADD COLUMN IF NOT EXISTS total_travel_hours NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_work_hours NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS no_of_visits_current INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS no_of_visits_total INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS charge_per_visit NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS next_visit_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS next_visit_notes TEXT,
  ADD COLUMN IF NOT EXISTS final_test_run_result VARCHAR(50),
  ADD COLUMN IF NOT EXISTS final_equipment_status VARCHAR(100),
  ADD COLUMN IF NOT EXISTS quotation_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS safety_critical_issue BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalated_to VARCHAR(255),
  ADD COLUMN IF NOT EXISTS internal_checklist_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attachments_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS job_ready_for_invoicing BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES brands(id),
  ADD COLUMN IF NOT EXISTS photos_qty INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sound_file_url TEXT,
  ADD COLUMN IF NOT EXISTS alarm_fault_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS vibration_report_url TEXT;
