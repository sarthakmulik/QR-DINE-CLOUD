import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const sql = `
CREATE OR REPLACE FUNCTION assign_order_number_safely(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_hotel_id uuid;
  v_current_number integer;
  v_new_number integer;
BEGIN
  -- Lock the session row
  SELECT hotel_id, order_number INTO v_hotel_id, v_current_number
  FROM table_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- If it already has a number, just return it
  IF v_current_number IS NOT NULL THEN
    RETURN v_current_number;
  END IF;

  -- Generate new number
  v_new_number := generate_daily_order_number(v_hotel_id);

  -- Assign it
  UPDATE table_sessions
  SET order_number = v_new_number
  WHERE id = p_session_id;

  RETURN v_new_number;
END;
$$;
`;

  // We can't run raw SQL directly through supabase-js v2 easily without a postgres meta-extension or pg library
  // Wait, I can just use pg client! We have pg installed in the workspace.
}

main().catch(console.error);
