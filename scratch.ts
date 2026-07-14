import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await sb.from('table_sessions').select('checkout_initiated_at').limit(1);
  console.log("Error:", error);
  console.log("Data:", data);
}

main();
