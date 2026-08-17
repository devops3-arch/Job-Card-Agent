-- Migration 015: Add profile fields edited by the Profile Settings screen.
-- The UI has always sent phone/department; the columns were never created.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT;
