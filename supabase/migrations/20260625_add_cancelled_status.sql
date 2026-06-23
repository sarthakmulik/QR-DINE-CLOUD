-- Adds support for 'cancelled' status
ALTER TABLE table_sessions DROP CONSTRAINT IF EXISTS table_sessions_status_check;
ALTER TABLE table_sessions ADD CONSTRAINT table_sessions_status_check 
  CHECK (status IN ('draft', 'payment_pending', 'open', 'checkout_initiated', 'bill_printed', 'closed', 'ready_for_pickup', 'cancelled'));
