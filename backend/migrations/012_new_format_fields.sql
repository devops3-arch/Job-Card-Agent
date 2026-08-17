-- Migration 012: New field service report format
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    active BOOLEAN DEFAULT TRUE
);

INSERT INTO brands (name) VALUES
 ('Kaeser'), ('Atlas Copco'), ('Ingersoll Rand'), ('Sullair'), ('Gardner Denver'),
 ('Quincy Compressor'), ('CompAir'), ('ELGi'), ('Hitachi'), ('Hanwha Power Systems'),
 ('Clivet'), ('Nederman'), ('Onsigen')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE job_master
  ADD COLUMN IF NOT EXISTS customer_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS site_contact VARCHAR(255),
  ADD COLUMN IF NOT EXISTS time_in TIME,
  ADD COLUMN IF NOT EXISTS time_out TIME,
  ADD COLUMN IF NOT EXISTS report_date DATE,
  ADD COLUMN IF NOT EXISTS customer_po_ref VARCHAR(255),
  ADD COLUMN IF NOT EXISTS complaint_issue_description VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_equipment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS equipment_type VARCHAR(255),
  ADD COLUMN IF NOT EXISTS meter_reading INTEGER,
  ADD COLUMN IF NOT EXISTS capacity_rating VARCHAR(255),
  ADD COLUMN IF NOT EXISTS controller_panel_model VARCHAR(255),
  ADD COLUMN IF NOT EXISTS alarm_fault_code VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_service_date DATE,
  ADD COLUMN IF NOT EXISTS last_service_hours INTEGER,
  ADD COLUMN IF NOT EXISTS oil_refrigerant_fuel_type VARCHAR(255),
  ADD COLUMN IF NOT EXISTS duty_cycle VARCHAR(255),
  ADD COLUMN IF NOT EXISTS warranty_status VARCHAR(255),
  ADD COLUMN IF NOT EXISTS warranty_claim_ref VARCHAR(255),
  ADD COLUMN IF NOT EXISTS previous_job_ref VARCHAR(255),
  ADD COLUMN IF NOT EXISTS customer_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS findings JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS operating_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}'::jsonb;
