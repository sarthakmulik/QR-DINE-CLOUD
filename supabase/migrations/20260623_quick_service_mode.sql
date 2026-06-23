-- Migration: Quick Service (Pay-First) Mode

-- 1. Alter hotels table to support quick_service and sequence tracking
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'dine_in' CHECK (service_type IN ('dine_in', 'quick_service'));
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS daily_order_sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS last_sequence_reset DATE DEFAULT CURRENT_DATE;

-- 2. Alter table_sessions to support null tables (for quick service) and daily order numbers
ALTER TABLE table_sessions ALTER COLUMN table_id DROP NOT NULL;
ALTER TABLE table_sessions ALTER COLUMN table_number DROP NOT NULL;
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS order_number INTEGER;

-- 3. Update session status enum to include 'draft' and 'ready_for_pickup'
ALTER TABLE table_sessions DROP CONSTRAINT IF EXISTS table_sessions_status_check;
ALTER TABLE table_sessions ADD CONSTRAINT table_sessions_status_check 
  CHECK (status IN ('draft', 'open', 'checkout_initiated', 'bill_printed', 'closed', 'ready_for_pickup'));

-- Ensure default remains open
ALTER TABLE table_sessions ALTER COLUMN status SET DEFAULT 'open';

-- 4. Add index for fast order number lookups (especially for KDS)
CREATE INDEX IF NOT EXISTS idx_table_sessions_order_number ON table_sessions(order_number);

-- 5. Create RPC for atomic daily sequence increment
CREATE OR REPLACE FUNCTION generate_daily_order_number(p_hotel_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_current_seq INTEGER;
  v_last_reset DATE;
BEGIN
  -- Lock the row for update to prevent race conditions
  SELECT daily_order_sequence, last_sequence_reset
  INTO v_current_seq, v_last_reset
  FROM hotels
  WHERE id = p_hotel_id
  FOR UPDATE;

  -- If the last reset was not today, reset to 1
  IF v_last_reset IS NULL OR v_last_reset < CURRENT_DATE THEN
    UPDATE hotels
    SET daily_order_sequence = 1, last_sequence_reset = CURRENT_DATE
    WHERE id = p_hotel_id;
    RETURN 1;
  ELSE
    -- Otherwise, increment
    UPDATE hotels
    SET daily_order_sequence = v_current_seq + 1
    WHERE id = p_hotel_id;
    RETURN v_current_seq + 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
