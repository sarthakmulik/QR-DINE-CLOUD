ALTER TABLE table_sessions
ADD COLUMN IF NOT EXISTS checkout_initiated_at TIMESTAMPTZ;