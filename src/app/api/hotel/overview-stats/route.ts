import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // All 3 queries in parallel
    const [openSessionsRes, todaySessionsRes, feedbackRes] = await Promise.all([
      sb.from("table_sessions").select("id").eq("hotel_id", hotelId).eq("status", "open"),
      sb.from("table_sessions").select("total, status, start_time").eq("hotel_id", hotelId).gte("start_time", startOfToday.toISOString()),
      sb.from("feedback").select("rating").eq("hotel_id", hotelId),
    ]);

    const activeSessionsCount = openSessionsRes.data?.length || 0;

    const todaySessions = todaySessionsRes.data || [];
    const todayClosedSessions = todaySessions.filter((s) => s.status === "closed");
    const todayRevenue = todayClosedSessions.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const todayOrdersCount = todaySessions.length;

    const feedbackData = feedbackRes.data || [];
    let avgRating = 0;
    if (feedbackData.length > 0) {
      const sum = feedbackData.reduce((acc, f) => acc + f.rating, 0);
      avgRating = Number((sum / feedbackData.length).toFixed(1));
    }

    const hourlyMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourlyMap[h] = 0;
    todaySessions.forEach((s) => {
      const hour = new Date(new Date(s.start_time).getTime() + 5.5 * 60 * 60 * 1000).getUTCHours();
      hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
    });

    const hourlyDistribution = Object.entries(hourlyMap)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => a.hour - b.hour);

    return NextResponse.json({ activeSessions: activeSessionsCount, todayRevenue, todayOrders: todayOrdersCount, avgRating, hourlyDistribution });
  } catch (err) {
    console.error("Error in overview stats API:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
