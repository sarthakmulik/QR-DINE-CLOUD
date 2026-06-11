/**
 * Applies supabase/schema.sql when DATABASE_URL is set.
 * Get it from Supabase Dashboard → Settings → Database → Connection string (URI).
 *
 * Usage: DATABASE_URL="postgresql://..." npm run db:migrate
 */
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "DATABASE_URL not set.\n" +
        "Either set DATABASE_URL and re-run, or paste supabase/schema.sql into the Supabase SQL Editor."
    );
    process.exit(1);
  }

  const sql = readFileSync(
    join(process.cwd(), "supabase", "schema.sql"),
    "utf-8"
  );

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Schema applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
