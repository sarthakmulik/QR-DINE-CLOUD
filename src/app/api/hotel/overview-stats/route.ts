import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    // 1. Get Active Sessions (open sessions)
    const { data: openSessions } = await sb
      .from("table_sessions")
      .select("id")
      .eq("hotel_id", hotelId)
      .eq("status", "open");

    const activeSessionsCount = openSessions?.length || 0;

    // 2. Get Today's Billed/Closed sessions
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: todaySessions } = await sb
      .from("table_sessions")
      .select("total, status, start_time")
      .eq("hotel_id", hotelId)
      .gte("start_time", startOfToday.toISOString());

    const todayClosedSessions = todaySessions?.filter(s => s.status === "closed") || [];
    const todayRevenue = todayClosedSessions.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const todayOrdersCount = todaySessions?.length || 0;

    // 3. Get Average Rating
    const { data: feedbackData } = await sb
      .from("feedback")
      .select("rating")
      .eq("hotel_id", hotelId);

    let avgRating = 0;
    if (feedbackData && feedbackData.length > 0) {
      const sum = feedbackData.reduce((acc, f) => acc + f.rating, 0);
      avgRating = Number((sum / feedbackData.length).toFixed(1));
    }

    // 4. Compute Hourly Distribution for Today's orders
    const hourlyMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = 0;
    }

    todaySessions?.forEach((s) => {
      const utcMs = new Date(s.start_time).getTime();
      const istMs = utcMs + 5.5 * 60 * 60 * 1000; // India Standard Time
      const hour = new Date(istMs).getUTCHours();
      hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
    });

    const hourlyDistribution = Object.entries(hourlyMap).map(([hour, count]) => ({
      hour: parseInt(hour),
      count,
    })).sort((a, b) => a.hour - b.hour);

    return NextResponse.json({
      activeSessions: activeSessionsCount,
      todayRevenue,
      todayOrders: todayOrdersCount,
      avgRating,
      hourlyDistribution,
    });
  } catch (err) {
    console.error("Error in overview stats API:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
