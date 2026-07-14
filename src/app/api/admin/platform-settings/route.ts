import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSuperAdmin();
    const sb = createAdminClient();
    
    // We get the singular platform settings row
    const { data: settings } = await sb
      .from("platform_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    return NextResponse.json(settings || {});
  } catch (err: any) {
    console.error("Platform Settings GET Error:", err);
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json();
    const { whatsapp_api_key, password } = body;

    if (!password) {
      return NextResponse.json({ error: "Password required to verify changes." }, { status: 403 });
    }

    // Verify Password
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: password,
    });

    if (signInError) {
      return NextResponse.json({ error: "Invalid password" }, { status: 403 });
    }

    const sb = createAdminClient();
    
    const { data: updated, error } = await sb
      .from("platform_settings")
      .update({
        whatsapp_api_key: whatsapp_api_key || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("Platform Settings POST Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
