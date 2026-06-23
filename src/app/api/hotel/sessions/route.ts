import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapTableSession } from "@/lib/types";
import type { SessionItem, TableSession } from "@/lib/types";
import { getOrCreateOpenSession } from "@/lib/session-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    // --- AUTO-CLEANUP LOGIC (Quick Service) ---
    const now = Date.now();
    const fiveMinsAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const tenMinsAgo = new Date(now - 10 * 60 * 1000).toISOString();

    // 1. Auto-collect ready orders forgotten for 5 mins
    await sb.from("table_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
      .eq("status", "ready_for_pickup")
      .lt("updated_at", fiveMinsAgo);

    // 2. Auto-discard unpaid orders abandoned for 10 mins
    await sb.from("table_sessions")
      .update({ status: "cancelled", closed_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
      .eq("status", "payment_pending")
      .lt("updated_at", tenMinsAgo);
    // ------------------------------------------

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
      .neq("status", "cancelled")
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

export async function POST(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const body = await req.json();
    const tableNumber = parseInt(body.tableNumber);

    if (isNaN(tableNumber) || tableNumber < 1) {
      return NextResponse.json({ error: "Invalid table number" }, { status: 400 });
    }

    const result = await getOrCreateOpenSession(hotelId, tableNumber);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.session);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create session" },
      { status: 500 }
    );
  }
}
