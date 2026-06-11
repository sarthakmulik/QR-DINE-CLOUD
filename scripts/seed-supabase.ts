import { createClient } from "@supabase/supabase-js";

const SUPER_ADMIN_EMAIL = "sarthakmulik16@gmail.com";
const SUPER_ADMIN_PASSWORD = "SuperAdmin@123";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingProfile } = await sb
    .from("profiles")
    .select("id")
    .eq("email", SUPER_ADMIN_EMAIL)
    .maybeSingle();

  if (existingProfile) {
    console.log(`Super Admin already exists: ${SUPER_ADMIN_EMAIL}`);
    return;
  }

  const { data: authUser, error: authError } = await sb.auth.admin.createUser({
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Super Admin" },
  });

  if (authError || !authUser.user) {
    console.error("Failed to create auth user:", authError?.message);
    process.exit(1);
  }

  const { error: profileError } = await sb.from("profiles").insert({
    id: authUser.user.id,
    email: SUPER_ADMIN_EMAIL,
    name: "Super Admin",
    role: "superadmin",
    hotel_id: null,
  });

  if (profileError) {
    console.error("Failed to create profile:", profileError.message);
    await sb.auth.admin.deleteUser(authUser.user.id);
    process.exit(1);
  }

  console.log(`Super Admin created: ${SUPER_ADMIN_EMAIL}`);
  console.log(`Password: ${SUPER_ADMIN_PASSWORD}`);
}

main();
