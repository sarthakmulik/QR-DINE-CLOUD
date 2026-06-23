-- Migration: Quick Service Improvements
-- Adds support for secure token and payment pending status

-- 1. Add quick_service_token to hotels
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS quick_service_token UUID DEFAULT gen_random_uuid();

-- 2. Update table_sessions status to include 'payment_pending'
-- Need to drop the constraint and recreate it
ALTER TABLE table_sessions DROP CONSTRAINT IF EXISTS table_sessions_status_check;
ALTER TABLE table_sessions ADD CONSTRAINT table_sessions_status_check 
  CHECK (status IN ('draft', 'payment_pending', 'open', 'checkout_initiated', 'bill_printed', 'closed', 'ready_for_pickup'));

-- Update default for future use
ALTER TABLE table_sessions ALTER COLUMN status SET DEFAULT 'open';
