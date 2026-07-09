export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Hotel } from "@/lib/types";

export async function GET() {
  try {
    await requireSuperAdmin();

    const { data: hotels, error } = await createAdminClient()
      .from("hotels")
      .select("*");

    if (error) throw error;

    const list = (hotels || []) as Hotel[];
    const now = new Date();

    const totalHotels = list.length;
    const activeHotels = list.filter((h) => h.status === "active").length;
    const totalMRR = list
      .filter((h) => h.status === "active")
      .reduce((sum, h) => sum + Number(h.billing_amount), 0);
    const overdueHotels = list.filter(
      (h) =>
        h.next_due_date &&
        new Date(h.next_due_date) < now &&
        h.status === "active"
    ).length;

    return NextResponse.json({
      totalHotels,
      activeHotels,
      totalMRR,
      overdueHotels,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

