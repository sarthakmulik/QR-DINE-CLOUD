import { syncFranchiseMenu } from "./src/app/franchise/menu/actions";

async function run() {
  try {
    // We need a sourceHotelId. We'll fetch one first.
    const { createClient } = require("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Find an organization with multiple hotels
    const { data: orgs } = await sb.from("organizations").select("id").limit(1);
    if (!orgs || orgs.length === 0) return console.log("No orgs");

    const { data: hotels } = await sb.from("hotels").select("id").eq("organization_id", orgs[0].id);
    if (!hotels || hotels.length <= 1) return console.log("No multi-branch orgs");

    const sourceHotelId = hotels[0].id;
    console.log("Testing sync for:", sourceHotelId);
    
    // Mock the auth user
    // Wait, syncFranchiseMenu relies on getAuthUser() which relies on cookies().
    // We can't easily mock it in a node script.
  } catch(e) {
    console.error(e);
  }
}
run();
