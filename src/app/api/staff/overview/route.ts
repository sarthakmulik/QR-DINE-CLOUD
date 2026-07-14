export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RestaurantTable, TableSession, SessionItem } from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import { getTableStatus } from "@/lib/session-service";

import { unstable_cache } from "next/cache";

// We need a wrapper to pass dynamic tags properly
const getOverviewForHotel = (hotelId: string) => {
  return unstable_cache(
    async () => {
      const sb = createAdminClient();

      const [hotelRes, tablesRes, sessionsRes, requestsRes] = await Promise.all([
        sb.from("hotels").select("name, plan, status").eq("id", hotelId).single(),
        sb.from("restaurant_tables").select("*").eq("hotel_id", hotelId).order("table_number", { ascending: true }),
        sb.from("table_sessions").select("*").eq("hotel_id", hotelId).neq("status", "closed"),
        sb.from("waiter_requests").select("*").eq("hotel_id", hotelId).eq("status", "pending").order("created_at", { ascending: true }),
      ]);

      if (hotelRes.error || !hotelRes.data) throw new Error("Hotel not found");

      const hotel = hotelRes.data;
      if (hotel.status === "paused" || hotel.status === "suspended") throw new Error("SERVICE_PAUSED");
      if (hotel.plan.toLowerCase() === "basic") throw new Error("BASIC_PLAN");

      const tables = (tablesRes.data || []) as RestaurantTable[];
      const sessions = (sessionsRes.data || []) as TableSession[];
      const waiterRequests = requestsRes.data || [];

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

      const itemsBySessionId: Record<string, SessionItem[]> = {};
      for (const item of allItems) {
        if (!itemsBySessionId[item.session_id]) itemsBySessionId[item.session_id] = [];
        itemsBySessionId[item.session_id].push(item);
      }

      const sessionsMap: Record<string, TableSession> = {};
      for (const session of sessions) sessionsMap[session.id] = session;

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

      return {
        hotelName: hotel.name,
        plan: hotel.plan,
        tables: enrichedTables,
        waiterRequests: waiterRequests,
      };
    },
    [`staff-overview-${hotelId}`],
    { tags: [`staff-overview-${hotelId}`], revalidate: 3600 }
  )();
};

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    
    try {
      const data = await getOverviewForHotel(hotelId);
      
      // Calculate real-time checkout timers outside the cache
      const tablesWithTimers = data.tables.map(table => {
        let checkoutTimerState: "safe" | "attention" | "danger" = "safe";
        
        if (table.currentSession?.status === "checkout_initiated" && table.currentSession.checkoutInitiatedAt) {
          const elapsedMins = (Date.now() - new Date(table.currentSession.checkoutInitiatedAt).getTime()) / (1000 * 60);
          if (elapsedMins >= 15) {
            checkoutTimerState = "danger";
          } else if (elapsedMins >= 10) {
            checkoutTimerState = "attention";
          }
        }
        
        return {
          ...table,
          checkoutTimerState
        };
      });

      return NextResponse.json({
        ...data,
        tables: tablesWithTimers
      });
    } catch (err: any) {
      if (err.message === "SERVICE_PAUSED") {
        return NextResponse.json({ error: "Service Paused", code: "SERVICE_PAUSED" }, { status: 403 });
      }
      if (err.message === "BASIC_PLAN") {
        return NextResponse.json({ error: "Staff dashboard is not available on Basic plan." }, { status: 403 });
      }
      if (err.message === "Hotel not found") {
        return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
      }
      throw err;
    }
  } catch (err: any) {
    console.error("Staff overview load error:", err);
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}

