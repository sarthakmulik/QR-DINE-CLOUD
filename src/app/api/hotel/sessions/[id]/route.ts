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

    const { data: session } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle<TableSession>();

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: items } = await sb
      .from("session_items")
      .select("*")
      .eq("session_id", id)
      .order("added_at", { ascending: true });

    const { data: hotel } = await sb
      .from("hotels")
      .select("*")
      .eq("id", hotelId)
      .single<Hotel>();

    const { data: table } = await sb
      .from("restaurant_tables")
      .select("*")
      .eq("id", session.table_id)
      .single<RestaurantTable>();

    return NextResponse.json(
      mapTableSession(
        session,
        (items || []) as SessionItem[],
        hotel || undefined,
        table || undefined
      )
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
