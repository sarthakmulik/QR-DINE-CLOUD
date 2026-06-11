import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapHotel } from "@/lib/types";
import type { Hotel } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const body = await req.json();
    const { plan } = body;

    if (!plan || !["basic", "pro", "elite"].includes(plan.toLowerCase())) {
      return NextResponse.json({ error: "Invalid plan type" }, { status: 400 });
    }

    const { data: hotel, error } = await createAdminClient()
      .from("hotels")
      .update({ plan: plan.toLowerCase() })
      .eq("id", id)
      .select("*")
      .single<Hotel>();

    if (error) throw error;

    return NextResponse.json(mapHotel(hotel));
  } catch (err: any) {
    console.error("Super Admin plan update error:", err);
    const isAuthError = err.message === "Unauthorized";
    return NextResponse.json(
      { error: err.message || "Server Error" },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
