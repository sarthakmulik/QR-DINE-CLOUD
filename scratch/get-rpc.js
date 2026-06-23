import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  await client.connect();
  const res = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'generate_daily_order_number';
  `);
  console.log(res.rows[0]?.prosrc);
  await client.end();
}
check();
