import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableSession, SessionItem } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const sb = createAdminClient();

    // Verify hotel plan for elite analytics access
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan")
      .eq("id", hotelId)
      .single();

    if (!hotel || hotel.plan.toLowerCase() !== "elite") {
      return NextResponse.json(
        { error: "Advanced Analytics is only available on the Elite plan." },
        { status: 403 }
      );
    }

    let query = sb
      .from("table_sessions")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("status", "closed");

    if (from) {
      query = query.gte("closed_at", from);
    }
    if (to) {
      query = query.lte("closed_at", to);
    }

    const { data: sessions, error: sessionsError } = await query.order("closed_at", {
      ascending: true,
    });

    if (sessionsError) {
      console.error("Error fetching analytics sessions:", sessionsError);
      return NextResponse.json({ error: "Failed to fetch session data" }, { status: 500 });
    }

    const typedSessions = (sessions || []) as TableSession[];
    const totalSessions = typedSessions.length;

    // 1. Calculate Total Revenue & AOV
    const totalRevenue = typedSessions.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const avgOrderValue = totalSessions > 0 ? totalRevenue / totalSessions : 0;

    // 2. Fetch Session Items for Item metrics
    let items: SessionItem[] = [];
    if (totalSessions > 0) {
      const sessionIds = typedSessions.map((s) => s.id);
      
      // Batch select in chunks of 500 if session count is huge
      const chunkSize = 500;
      for (let i = 0; i < sessionIds.length; i += chunkSize) {
        const chunk = sessionIds.slice(i, i + chunkSize);
        const { data: chunkItems, error: itemsError } = await sb
          .from("session_items")
          .select("*")
          .in("session_id", chunk);

        if (!itemsError && chunkItems) {
          items = items.concat(chunkItems as SessionItem[]);
        }
      }
    }

    // 3. Compute Item Stats (Top item, Top 5 items)
    const itemQuantities: Record<string, number> = {};
    items.forEach((item) => {
      itemQuantities[item.name] = (itemQuantities[item.name] || 0) + (item.quantity || 1);
    });

    const sortedItems = Object.entries(itemQuantities)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);

    const topItem = sortedItems[0]
      ? { name: sortedItems[0].name, count: sortedItems[0].qty }
      : { name: "N/A", count: 0 };

    const topItems = sortedItems.slice(0, 5);

    // 4. Compute Daily Revenue — grouped by IST date
    function toISTDateStr(utcIso: string): string {
      // IST = UTC+5:30 = UTC+330 minutes
      const utcMs = new Date(utcIso).getTime();
      const istMs = utcMs + 5.5 * 60 * 60 * 1000;
      return new Date(istMs).toISOString().split("T")[0];
    }

    const dailyMap: Record<string, number> = {};
    typedSessions.forEach((s) => {
      if (s.closed_at) {
        const dateStr = toISTDateStr(s.closed_at);
        dailyMap[dateStr] = (dailyMap[dateStr] || 0) + Number(s.total || 0);
      }
    });

    const dailyRevenue = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date, revenue }));

    // 5. Compute hourly distribution (using start_time)
    const hourlyMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = 0;
    }

    typedSessions.forEach((s) => {
      // Convert UTC to IST for accurate hour bucketing
      const utcMs = new Date(s.start_time).getTime();
      const istMs = utcMs + 5.5 * 60 * 60 * 1000;
      const hour = new Date(istMs).getUTCHours();
      hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
    });

    const byHour = Object.entries(hourlyMap).map(([hour, count]) => ({
      hour: parseInt(hour),
      count,
    }));

    // 6. Compute Table Performance
    const tableMap: Record<
      number,
      { sessions: number; revenue: number; tableNumber: number }
    > = {};

    typedSessions.forEach((s) => {
      const tNum = s.table_number ?? 0;
      if (!tableMap[tNum]) {
        tableMap[tNum] = { tableNumber: tNum, sessions: 0, revenue: 0 };
      }
      tableMap[tNum].sessions += 1;
      tableMap[tNum].revenue += Number(s.total || 0);
    });

    const tablePerformance = Object.values(tableMap)
      .map((t) => ({
        tableNumber: t.tableNumber,
        sessions: t.sessions,
        revenue: t.revenue,
        avgValue: t.sessions > 0 ? t.revenue / t.sessions : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      totalRevenue,
      totalSessions,
      avgOrderValue,
      topItem,
      dailyRevenue,
      topItems,
      byHour,
      tablePerformance,
    });
  } catch (err) {
    console.error("Error in analytics API route:", err);
    return NextResponse.json({ error: "Unauthorized or server error" }, { status: 401 });
  }
}
