import { Client } from "pg";


async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE hotels 
      ADD COLUMN IF NOT EXISTS welcome_animation_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS welcome_animation_preset TEXT NOT NULL DEFAULT 'elegant' CHECK (welcome_animation_preset IN ('elegant', 'vibrant', 'minimal'));
    `);
    console.log("Migration applied successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await client.end();
  }
}

main();
