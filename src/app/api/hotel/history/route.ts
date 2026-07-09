export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapTableSession } from "@/lib/types";
import type { SessionItem, TableSession } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const sb = createAdminClient();

    // Single nested join — eliminates N+1 items and table fetches
    const { data: sessions } = await sb
      .from("table_sessions")
      .select(`
        *,
        session_items (*),
        restaurant_tables!table_sessions_table_id_fkey (label, table_number)
      `)
      .eq("hotel_id", hotelId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(limit);

    const result = ((sessions || []) as any[]).map((session) => {
      const items = (session.session_items || []) as SessionItem[];
      const table = session.restaurant_tables;
      return {
        ...mapTableSession(session as TableSession, items),
        table: table
          ? { label: table.label, tableNumber: table.table_number }
          : undefined,
      };
    });

    const totalRevenue = result.reduce((sum, s) => sum + s.total, 0);

    return NextResponse.json({ sessions: result, totalRevenue, count: result.length });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

