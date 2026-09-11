
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
  const { data: tables } = await supabase.from('table_sessions').select('status').limit(1);
  console.log('DB Connection:', tables ? 'Success' : 'Failed');
}
test();

