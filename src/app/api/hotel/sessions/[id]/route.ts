import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Hotel, RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import { mapHotel, mapTableSession } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const sb = createAdminClient();

    // Single join: session + items + hotel + table in one query
    const { data: session } = await sb
      .from("table_sessions")
      .select(`
        *,
        session_items (*),
        hotels (*),
        restaurant_tables!table_sessions_table_id_fkey (*)
      `)
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const items = (session.session_items || []) as SessionItem[];
    const hotel = session.hotels as Hotel | null;
    const table = session.restaurant_tables as RestaurantTable | null;

    return NextResponse.json(
      mapTableSession(session as TableSession, items, hotel || undefined, table || undefined)
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
