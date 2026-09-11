const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function check() {
  const { data, error } = await supabase.from('payment_intents').select('*').limit(5);
  console.log(data);
}
check();