import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }

  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260623_quick_service_mode.sql"),
    "utf-8"
  );

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
