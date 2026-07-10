export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Hotel } from "@/lib/types";

export async function GET() {
  try {
    await requireSuperAdmin();
    const sb = createAdminClient();

    const [hotelsRes, allSessionsRes, recentSessionsRes] = await Promise.all([
      sb.from("hotels").select("*"),
      sb.from("table_sessions").select("total, status").neq("status", "cancelled"),
      sb.from("table_sessions").select("hotel_id").gte("start_time", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    if (hotelsRes.error) throw hotelsRes.error;

    const list = (hotelsRes.data || []) as Hotel[];
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

    const totalOrdersProcessed = allSessionsRes.data?.length || 0;
    const platformGrossVolume = allSessionsRes.data?.reduce((sum, s) => sum + Number(s.total), 0) || 0;

    const recentHotelIds = new Set(recentSessionsRes.data?.map(s => s.hotel_id) || []);
    const atRiskHotelsList = list.filter(h => h.status === "active" && !recentHotelIds.has(h.id)).map(h => ({
      id: h.id,
      name: h.name,
      ownerName: h.owner_name,
      ownerEmail: h.owner_email,
      ownerPhone: h.owner_phone,
    }));

    return NextResponse.json({
      totalHotels,
      activeHotels,
      totalMRR,
      overdueHotels,
      totalOrdersProcessed,
      platformGrossVolume,
      atRiskHotelsList,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}

