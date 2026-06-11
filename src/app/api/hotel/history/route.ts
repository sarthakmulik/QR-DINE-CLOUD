import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const sb = createAdminClient();

    const { data: sessions } = await sb
      .from("table_sessions")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(limit);

    const result = await Promise.all(
      ((sessions || []) as TableSession[]).map(async (session) => {
        const { data: items } = await sb
          .from("session_items")
          .select("*")
          .eq("session_id", session.id);

        const { data: table } = await sb
          .from("restaurant_tables")
          .select("*")
          .eq("id", session.table_id)
          .single<RestaurantTable>();

        return {
          ...mapTableSession(session, (items || []) as SessionItem[]),
          table: table
            ? { label: table.label, tableNumber: table.table_number }
            : undefined,
        };
      })
    );

    const totalRevenue = result.reduce((sum, s) => sum + s.total, 0);

    return NextResponse.json({
      sessions: result,
      totalRevenue,
      count: result.length,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
