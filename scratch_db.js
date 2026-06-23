import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/hotels?select=id,name,service_type,payment_settings,upi_id&service_type=eq.quick_service`, {
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  }
}).then(r=>r.json()).then(console.log);
