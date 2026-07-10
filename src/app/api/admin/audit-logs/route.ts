import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireSuperAdmin();
    const sb = createAdminClient();

    // Fetch the latest 100 audit logs, optionally join with profiles to get user info
    // For simplicity, we just fetch the logs and the related hotel names
    const { data: logs, error } = await sb
      .from("platform_audit_logs")
      .select(`
        *,
        hotels (name)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json(logs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
