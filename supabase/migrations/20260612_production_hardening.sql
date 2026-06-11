-- Production Hardening Migrations
-- Run this against your Supabase project via SQL Editor

-- ═══════════════════════════════════════════════════════════════
-- SECTION 1: Prevent duplicate open sessions per table
-- ═══════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_one_open_session;
CREATE UNIQUE INDEX idx_one_open_session
  ON table_sessions (hotel_id, table_number)
  WHERE status = 'open';

-- ═══════════════════════════════════════════════════════════════
-- SECTION 2: Audit log table for session lifecycle events
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS session_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES table_sessions(id) ON DELETE CASCADE,
  hotel_id     UUID REFERENCES hotels(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  reason       TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- SECTION 15: Query performance indexes
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_sessions_hotel_table_status
  ON table_sessions (hotel_id, table_number, status);

CREATE INDEX IF NOT EXISTS idx_sessions_hotel_created
  ON table_sessions (hotel_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_session_items_session
  ON session_items (session_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_hotel_category
  ON menu_items (hotel_id, category_id);

CREATE INDEX IF NOT EXISTS idx_tables_hotel
  ON restaurant_tables (hotel_id);

CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON table_sessions (status);

CREATE INDEX IF NOT EXISTS idx_sessions_closed_at
  ON table_sessions (hotel_id, closed_at DESC)
  WHERE closed_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 6: Force-close orphaned sessions
-- Run manually if needed: closes any open sessions where the
-- table has been physically empty for >4 hours
-- ═══════════════════════════════════════════════════════════════
-- UPDATE table_sessions
-- SET status = 'closed', closed_at = NOW(), end_time = NOW()
-- WHERE status = 'open'
--   AND start_time < NOW() - INTERVAL '4 hours';

-- ═══════════════════════════════════════════════════════════════
-- SECTION 16: Analytics materialized helper view
-- (Read-only; recalculate at query time for accuracy)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW hotel_daily_revenue AS
SELECT
  hotel_id,
  DATE(closed_at AT TIME ZONE 'Asia/Kolkata') AS date_ist,
  COUNT(*) AS sessions_count,
  ROUND(SUM(subtotal)::numeric, 2) AS total_subtotal,
  ROUND(SUM(tax_amount)::numeric, 2) AS total_tax,
  ROUND(SUM(total)::numeric, 2) AS total_revenue,
  COUNT(*) FILTER (WHERE payment_method = 'Cash') AS cash_count,
  COUNT(*) FILTER (WHERE payment_method = 'UPI') AS upi_count,
  COUNT(*) FILTER (WHERE payment_method = 'Card') AS card_count
FROM table_sessions
WHERE status = 'closed'
  AND closed_at IS NOT NULL
GROUP BY hotel_id, DATE(closed_at AT TIME ZONE 'Asia/Kolkata');

-- ═══════════════════════════════════════════════════════════════
-- SECTION 7: Data integrity function — recalculate ALL sessions
-- Run manually after any manual price corrections
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION recalculate_all_session_totals(p_hotel_id UUID)
RETURNS void AS $$
DECLARE
  sess RECORD;
  sub  NUMERIC;
  tax  NUMERIC;
  rate NUMERIC;
BEGIN
  SELECT tax_rate INTO rate FROM hotels WHERE id = p_hotel_id;
  FOR sess IN
    SELECT id FROM table_sessions WHERE hotel_id = p_hotel_id AND status != 'closed'
  LOOP
    SELECT COALESCE(SUM(price * quantity), 0) INTO sub
    FROM session_items WHERE session_id = sess.id;
    tax := ROUND(sub * (rate / 100), 2);
    UPDATE table_sessions
    SET subtotal = sub, tax_amount = tax, total = sub + tax
    WHERE id = sess.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
