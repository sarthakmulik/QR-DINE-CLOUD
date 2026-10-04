require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await sb.from('table_sessions').select('id, status, table_number, order_type, payment_method').order('created_at', { ascending: false }).limit(20);
  console.log(JSON.stringify(data, null, 2));
}
run();
