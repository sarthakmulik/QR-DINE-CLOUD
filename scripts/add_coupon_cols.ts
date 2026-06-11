import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing env variables");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from("table_sessions")
    .select("*")
    .limit(1);

  if (error) {
    console.error("Failed to query table_sessions:", error);
  } else {
    console.log("Successfully queried table_sessions!");
    if (data && data.length > 0) {
      console.log("Record keys in table_sessions:", Object.keys(data[0]));
    } else {
      console.log("No records found in table_sessions, but query succeeded.");
    }
  }
}

run();
