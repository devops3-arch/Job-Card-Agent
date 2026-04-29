-- PostgreSQL schema for Job Card Management System
-- Safe to re-run: uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS throughout.

-- ─── Core job table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_master (
    id SERIAL PRIMARY KEY,
    -- Customer Info
    customer_name TEXT,
    ref_no TEXT,
    job_card_no TEXT,
    job_date TEXT,
    customer_code TEXT,
    attention_of TEXT,
    email TEXT,
    contact_no TEXT,
    sales_area TEXT,
    under_warranty BOOLEAN,
    -- Job Info
    equipment_name TEXT,
    service_type TEXT,
    other_expenses NUMERIC DEFAULT 0,
    discount_percentage NUMERIC DEFAULT 0,
    -- Status
    status TEXT DEFAULT 'WAITING_PRICING',
    -- JSONB backup columns (kept for compatibility)
    parts JSONB DEFAULT '[]',
    labor JSONB DEFAULT '[]',
    compressor_checklist JSONB DEFAULT '[]',
    dryer_checklist JSONB DEFAULT '[]',
    -- Full payload backup (for audit / AI / integrations)
    job_data JSONB,
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- ─── Pricing header ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_header (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES job_master(id) ON DELETE CASCADE,
    labour_rate NUMERIC DEFAULT 0,
    service_charge NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    vat_percent NUMERIC DEFAULT 5,
    parts_total NUMERIC DEFAULT 0,
    labour_total NUMERIC DEFAULT 0,
    taxable_amount NUMERIC DEFAULT 0,
    vat_amount NUMERIC DEFAULT 0,
    grand_total NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── Structured parts table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_parts (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES job_master(id) ON DELETE CASCADE,
    part_name TEXT,
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0
);

-- ─── Structured labor table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_labor (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES job_master(id) ON DELETE CASCADE,
    description TEXT,
    hours NUMERIC DEFAULT 0,
    rate NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0
);

-- ─── Additive migrations (safe to re-run on existing databases) ───────────────
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS ref_no TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS job_card_no TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS job_date TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS customer_code TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS attention_of TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS contact_no TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS sales_area TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS under_warranty BOOLEAN;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS service_type TEXT;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS other_expenses NUMERIC DEFAULT 0;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC DEFAULT 0;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS parts JSONB DEFAULT '[]';
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS labor JSONB DEFAULT '[]';
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS compressor_checklist JSONB DEFAULT '[]';
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS dryer_checklist JSONB DEFAULT '[]';
-- New columns added in this migration:
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS job_data JSONB;
ALTER TABLE job_master ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS labour_rate NUMERIC DEFAULT 0;
ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS service_charge NUMERIC DEFAULT 0;
ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS vat_percent NUMERIC DEFAULT 5;
ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS parts_total NUMERIC DEFAULT 0;
ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS labour_total NUMERIC DEFAULT 0;
ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC DEFAULT 0;
ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0;
ALTER TABLE pricing_header ADD COLUMN IF NOT EXISTS grand_total NUMERIC DEFAULT 0;

-- ─── NOTE: pricing_header FK ON DELETE CASCADE ────────────────────────────────
-- If pricing_header was created without ON DELETE CASCADE on job_id, run manually:
--
--   ALTER TABLE pricing_header DROP CONSTRAINT IF EXISTS pricing_header_job_id_fkey;
--   ALTER TABLE pricing_header ADD CONSTRAINT pricing_header_job_id_fkey
--       FOREIGN KEY (job_id) REFERENCES job_master(id) ON DELETE CASCADE;
--
-- This is optional since the API now manages deletion explicitly.
-- Only run if you want DB-level cascade enforcement.
