-- Migration 002: Add signature metadata column to users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS signature_uploaded_at TIMESTAMP;
