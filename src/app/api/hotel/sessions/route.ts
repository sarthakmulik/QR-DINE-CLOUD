import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const { data: sessions } = await sb
      .from("table_sessions")
      .select("*")
      .eq("hotel_id", hotelId)
      .neq("status", "closed")
      .order("start_time", { ascending: false });

    const result = await Promise.all(
      ((sessions || []) as TableSession[]).map(async (session) => {
        const { data: items } = await sb
          .from("session_items")
          .select("*")
          .eq("session_id", session.id)
          .order("added_at", { ascending: true });

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

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
