const { Client } = require("pg");
const fs = require("fs");

async function run() {
  const connectionString = "postgresql://postgres.nlnwsjljvxbffkvgaowb:Amdryz-qibry6-nixqop@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    const sql = fs.readFileSync("C:\\Users\\prano\\.gemini\\antigravity\\brain\\cebd5cb2-a794-4a94-9320-8948ec06024c\\phase1_enterprise_upgrade.sql", "utf8");
    await client.query(sql);
    console.log("Migration executed successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}
run();

