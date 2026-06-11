import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";

/**
 * GET /api/hotel/sessions/stuck
 * Returns sessions stuck in open/checkout states for more than 12 hours.
 * Useful for the admin dashboard to detect and force-close orphaned sessions.
 */
export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: sessions } = await sb
      .from("table_sessions")
      .select("*")
      .eq("hotel_id", hotelId)
      .in("status", ["open", "checkout_initiated", "bill_printed"])
      .lt("start_time", twelveHoursAgo)
      .order("start_time", { ascending: true });

    const result = await Promise.all(
      ((sessions || []) as TableSession[]).map(async (session) => {
        const { data: items } = await sb
          .from("session_items")
          .select("*")
          .eq("session_id", session.id);

        const { data: table } = await sb
          .from("restaurant_tables")
          .select("label, table_number")
          .eq("id", session.table_id)
          .maybeSingle();

        const mapped = mapTableSession(session, items || []);
        return {
          ...mapped,
          table: table ? { label: table.label, tableNumber: table.table_number } : undefined,
          ageHours: Math.round(
            (Date.now() - new Date(session.start_time).getTime()) / (1000 * 60 * 60)
          ),
        };
      })
    );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
