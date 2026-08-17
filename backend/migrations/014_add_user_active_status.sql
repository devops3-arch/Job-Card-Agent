-- Add user active status for soft-disable support
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
