export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import { autoCleanupSessions } from "@/lib/session-service";
import crypto from "crypto";

/**
 * Kitchen Orders Fetcher - MUST NOT be cached.
 * The KDS is a live screen that must always return fresh data.
 * Caching this would cause orders to never appear on the kitchen screen
 * even when WebSockets trigger a re-fetch.
 */
async function getKitchenOrders(hotelId: string) {
  const sb = createAdminClient();

  // Fetch ONLY active/cancelled sessions (drop redundant restaurant_tables fetch)
  // Reduce selected columns to strictly what KDS needs.
  const [sessionsRes, cancelledSessionsRes] = await Promise.all([
    sb
      .from("table_sessions")
      .select("id, status, start_time, table_number, order_number")
      .eq("hotel_id", hotelId)
      .in("status", ["open", "payment_pending"])
      .order("start_time", { ascending: true }),
    sb
      .from("table_sessions")
      .select("id, status, start_time, table_number, order_number")
      .eq("hotel_id", hotelId)
      .eq("status", "cancelled")
      .gte("closed_at", new Date(Date.now() - 15 * 60 * 1000).toISOString()),
  ]);

  if (sessionsRes.error) throw new Error("Failed to fetch sessions");

  const activeSessions = (sessionsRes.data || []);
  const cancelledSessions = (cancelledSessionsRes?.data || []);

  const sessions = [...activeSessions, ...cancelledSessions].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const sessionIds = sessions.map((s) => s.id);
  let allItems: any[] = [];
  if (sessionIds.length > 0) {
    const { data: itemsRes } = await sb
      .from("session_items")
      .select("id, session_id, name, quantity, status, added_at")
      .in("session_id", sessionIds)
      .order("added_at", { ascending: true });
    allItems = (itemsRes || []);
  }

  const itemsBySessionId: Record<string, any[]> = {};
  for (const item of allItems) {
    if (!itemsBySessionId[item.session_id]) itemsBySessionId[item.session_id] = [];
    itemsBySessionId[item.session_id].push(item);
  }

  // Lightweight Kitchen Mapping - strips 75% of unused JSON payload
  return sessions.map((session) => {
    const sessionItems = itemsBySessionId[session.id] || [];
    return {
      id: session.id,
      status: session.status,
      startTime: session.start_time,
      tableNumber: session.table_number,
      orderNumber: session.order_number,
      items: sessionItems.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        status: item.status || "preparing"
      }))
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

    const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback_salt";
    const expectedToken = crypto
      .createHash("sha256")
      .update(`${hotel.kitchen_pin}-${hotelId}-${salt}`)
      .digest("hex");

    if (token !== expectedToken) {
      return NextResponse.json({ error: "Forbidden: Invalid token" }, { status: 403 });
    }

    const data = await getKitchenOrders(hotelId);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Error in kitchen orders API route:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
