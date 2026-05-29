-- Migration 010: Add equipment detail fields to job_master
ALTER TABLE job_master
    ADD COLUMN IF NOT EXISTS equipment_model TEXT;

ALTER TABLE job_master
    ADD COLUMN IF NOT EXISTS equipment_brand_description TEXT;

ALTER TABLE job_master
    ADD COLUMN IF NOT EXISTS equipment_part_no TEXT;

ALTER TABLE job_master
    ADD COLUMN IF NOT EXISTS equipment_serial_no TEXT;

ALTER TABLE job_master
    ADD COLUMN IF NOT EXISTS equipment_year TEXT;
