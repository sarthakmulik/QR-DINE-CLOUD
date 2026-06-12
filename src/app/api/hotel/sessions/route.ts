import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapTableSession } from "@/lib/types";
import type { SessionItem, TableSession } from "@/lib/types";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
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
      .neq("status", "closed")
      .order("start_time", { ascending: false });

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

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
