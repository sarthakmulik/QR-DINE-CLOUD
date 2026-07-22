export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import { autoCleanupSessions } from "@/lib/session-service";
import { verifyKitchenToken } from "@/lib/kitchen-auth";

/**
 * Kitchen Orders Fetcher - MUST NOT be cached.
 * The KDS is a live screen that must always return fresh data.
 * Caching this would cause orders to never appear on the kitchen screen
 * even when WebSockets trigger a re-fetch.
 */
async function getKitchenOrders(hotelId: string) {
  const sb = createAdminClient();

  // Auto-cleanup stale sessions
  await autoCleanupSessions(hotelId);

  // Fetch tables and open/cancelled sessions in parallel
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
}

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

    // Verify the signed kitchen token (not cached — security check must always be fresh)
    const { data: hotel } = await sb
      .from("hotels")
      .select("kitchen_pin")
      .eq("id", hotelId)
      .single();

    if (!hotel || !hotel.kitchen_pin) {
      return NextResponse.json({ error: "Kitchen PIN is not configured" }, { status: 400 });
    }

    if (!verifyKitchenToken(token, hotelId, hotel.kitchen_pin)) {
      return NextResponse.json({ error: "Forbidden: Invalid token" }, { status: 403 });
    }

    const data = await getKitchenOrders(hotelId);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Error in kitchen orders API route:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
