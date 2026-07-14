-- Migration: Add Cash Collection capabilities to Waiter Requests
ALTER TABLE waiter_requests ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT 'assistance';
ALTER TABLE waiter_requests ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES table_sessions(id) ON DELETE CASCADE;
