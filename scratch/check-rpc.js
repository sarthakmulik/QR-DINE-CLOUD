import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('generate_daily_order_number', { p_hotel_id: '123' });
  console.log("RPC result:", {data, error});
}
check();
