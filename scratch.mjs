import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase.from('hotel_staff').select('*').limit(5);
  console.log("hotel_staff error:", error?.message);
  console.log("hotel_staff data:", data);

  const { data: users, error: err2 } = await supabase.from('users').select('*').limit(5);
  console.log("users error:", err2?.message);
  console.log("users data:", users);
}

run();
