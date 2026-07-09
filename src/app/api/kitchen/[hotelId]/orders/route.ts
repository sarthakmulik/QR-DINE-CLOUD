export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import { autoCleanupSessions } from "@/lib/session-service";
import crypto from "crypto";

import { unstable_cache } from "next/cache";

const getCachedKitchenOrders = (hotelId: string) => {
  return unstable_cache(
    async () => {
      const sb = createAdminClient();

      // --- AUTO-CLEANUP LOGIC ---
      await autoCleanupSessions(hotelId);
      // ------------------------------------------

      // 1. Fetch tables and open sessions in parallel
      const [tablesRes, sessionsRes, cancelledSessionsRes] = await Promise.all([
        sb.from("restaurant_tables").select("*").eq("hotel_id", hotelId),
        sb
          .from("table_sessions")
          .select("*")
          .eq("hotel_id", hotelId)
          .in("status", ["open", "payment_pending"])
          .order("start_time", { ascending: true }),
        sb
          .from("table_sessions")
          .select("*")
          .eq("hotel_id", hotelId)
          .eq("status", "cancelled")
          .gte("closed_at", new Date(Date.now() - 15 * 60 * 1000).toISOString()),
      ]);

      if (sessionsRes.error) throw new Error("Failed to fetch sessions");

      const tables = (tablesRes.data || []) as RestaurantTable[];
      const activeSessions = (sessionsRes.data || []) as TableSession[];
      const cancelledSessions = (cancelledSessionsRes?.data || []) as TableSession[];

      const sessions = [...activeSessions, ...cancelledSessions].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      const sessionIds = sessions.map((s) => s.id);
      let allItems: SessionItem[] = [];
      if (sessionIds.length > 0) {
        const { data: itemsRes } = await sb
          .from("session_items")
          .select("*")
          .in("session_id", sessionIds)
          .order("added_at", { ascending: true });
        allItems = (itemsRes || []) as SessionItem[];
      }

      const tablesMap = new Map<string, RestaurantTable>();
      for (const table of tables) tablesMap.set(table.id, table);

      const itemsBySessionId: Record<string, SessionItem[]> = {};
      for (const item of allItems) {
        if (!itemsBySessionId[item.session_id]) itemsBySessionId[item.session_id] = [];
        itemsBySessionId[item.session_id].push(item);
      }

      return sessions.map((session) => {
        const sessionItems = itemsBySessionId[session.id] || [];
        const table = session.table_id ? tablesMap.get(session.table_id) : undefined;
        return {
          ...mapTableSession(session, sessionItems),
          table: table ? { label: table.label, tableNumber: table.table_number } : undefined,
        };
      });
    },
    [`kitchen-orders-${hotelId}`],
    { tags: [`kitchen-orders-${hotelId}`], revalidate: 3600 }
  )();
};

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string }> }
) {
  try {
    const params = await props.params;
    const hotelId = params.hotelId;

    if (!hotelId) return NextResponse.json({ error: "Missing hotel ID" }, { status: 400 });

    const token = req.headers.get("x-kitchen-token");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = createAdminClient();

    // Fetch hotel kitchen pin to verify signature token.
    // We don't cache this verification step as it's just 1 quick query and prevents unauthorized access to the cache.
    const { data: hotel } = await sb
      .from("hotels")
      .select("kitchen_pin")
      .eq("id", hotelId)
      .single();

    if (!hotel || !hotel.kitchen_pin) return NextResponse.json({ error: "Kitchen PIN is not configured" }, { status: 400 });

    const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback_salt";
    const expectedToken = crypto.createHash("sha256").update(`${hotel.kitchen_pin}-${hotelId}-${salt}`).digest("hex");

    if (token !== expectedToken) return NextResponse.json({ error: "Forbidden: Invalid token" }, { status: 403 });

    try {
      const data = await getCachedKitchenOrders(hotelId);
      return NextResponse.json(data);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  } catch (err) {
    console.error("Error in kitchen orders API route:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
