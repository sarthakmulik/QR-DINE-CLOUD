const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function test() {
  const { data } = await supabase.from('table_sessions').select('*').limit(1);
  console.log(Object.keys(data[0]));
}
test();