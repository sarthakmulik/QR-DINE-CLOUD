import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RestaurantTable, TableSession, SessionItem } from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import { getTableStatus } from "@/lib/session-service";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    // 1. Fetch hotel, tables, active sessions, and waiter requests in parallel
    const [hotelRes, tablesRes, sessionsRes, requestsRes] = await Promise.all([
      sb
        .from("hotels")
        .select("name, plan")
        .eq("id", hotelId)
        .single(),
      sb
        .from("restaurant_tables")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("table_number", { ascending: true }),
      sb
        .from("table_sessions")
        .select("*")
        .eq("hotel_id", hotelId)
        .neq("status", "closed"),
      sb
        .from("waiter_requests")
        .select("*")
        .eq("hotel_id", hotelId)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);

    if (hotelRes.error || !hotelRes.data) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    const hotel = hotelRes.data;
    if (hotel.plan.toLowerCase() === "basic") {
      return NextResponse.json({ error: "Staff dashboard is not available on Basic plan." }, { status: 403 });
    }

    const tables = (tablesRes.data || []) as RestaurantTable[];
    const sessions = (sessionsRes.data || []) as TableSession[];
    const waiterRequests = requestsRes.data || [];

    // 2. Fetch all session items in a single query
    const activeSessionIds = sessions.map((s) => s.id);
    let allItems: SessionItem[] = [];
    if (activeSessionIds.length > 0) {
      const { data: itemsRes } = await sb
        .from("session_items")
        .select("*")
        .in("session_id", activeSessionIds)
        .order("added_at", { ascending: true });
      allItems = (itemsRes || []) as SessionItem[];
    }

    // 3. Map sessions and items in memory
    const itemsBySessionId: Record<string, SessionItem[]> = {};
    for (const item of allItems) {
      if (!itemsBySessionId[item.session_id]) {
        itemsBySessionId[item.session_id] = [];
      }
      itemsBySessionId[item.session_id].push(item);
    }

    const sessionsMap: Record<string, TableSession> = {};
    for (const session of sessions) {
      sessionsMap[session.id] = session;
    }

    const enrichedTables = tables.map((table) => {
      let currentSession = null;

      if (table.current_session_id) {
        const session = sessionsMap[table.current_session_id];
        if (session) {
          const sessionItems = itemsBySessionId[session.id] || [];
          currentSession = mapTableSession(session, sessionItems);
        }
      }

      return {
        id: table.id,
        tableNumber: table.table_number,
        label: table.label,
        currentSessionId: table.current_session_id,
        currentSession,
        status: getTableStatus(currentSession),
      };
    });

    return NextResponse.json({
      hotelName: hotel.name,
      plan: hotel.plan,
      tables: enrichedTables,
      waiterRequests: waiterRequests,
    });
  } catch (err: any) {
    console.error("Staff overview load error:", err);
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}
