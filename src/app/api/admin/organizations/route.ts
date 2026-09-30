import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireSuperAdmin();
    const sb = createAdminClient();

    const { data: organizations, error } = await sb
      .from("organizations")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json(organizations);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
