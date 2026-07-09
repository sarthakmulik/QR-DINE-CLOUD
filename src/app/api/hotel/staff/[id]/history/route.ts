export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId, hotelPlan } = await requireHotelAccess();
    if (hotelPlan === "basic") {
      return NextResponse.json({ error: "Feature locked under Basic plan." }, { status: 403 });
    }

    const { id } = await props.params;
    const url = new URL(req.url);
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7); // YYYY-MM
    
    // Calculate date range for the month
    const startDate = new Date(`${month}-01T00:00:00Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + 1);

    const sb = createAdminClient();

    // 1. Fetch staff info
    const { data: staff, error: staffError } = await sb
      .from("staff")
      .select("id, name, role, email, salary_type, salary_amount")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .single();

    if (staffError || !staff) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    // 2. Fetch Attendance
    const { data: attendance } = await sb
      .from("staff_attendance")
      .select("*")
      .eq("staff_id", id)
      .gte("clock_in", startDate.toISOString())
      .lt("clock_in", endDate.toISOString())
      .order("clock_in", { ascending: false });

    // 3. Fetch Performance (Requests resolved)
    const { data: requests } = await sb
      .from("waiter_requests")
      .select("created_at")
      .eq("resolved_by", id)
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString());

    // 4. Fetch Performance (Items served)
    const { data: items } = await sb
      .from("session_items")
      .select("added_at")
      .eq("served_by", id)
      .gte("added_at", startDate.toISOString())
      .lt("added_at", endDate.toISOString());

    // Aggregate performance by day
    const dailyPerformance: Record<string, { requests: number; items: number }> = {};
    
    (requests || []).forEach(req => {
      const day = req.created_at.split('T')[0];
      if (!dailyPerformance[day]) dailyPerformance[day] = { requests: 0, items: 0 };
      dailyPerformance[day].requests++;
    });

    (items || []).forEach(item => {
      const day = item.added_at.split('T')[0];
      if (!dailyPerformance[day]) dailyPerformance[day] = { requests: 0, items: 0 };
      dailyPerformance[day].items++;
    });

    const performanceArray = Object.entries(dailyPerformance)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate Days Worked based on attendance (unique days)
    const daysWorkedSet = new Set<string>();
    (attendance || []).forEach(a => {
      daysWorkedSet.add(a.clock_in.split('T')[0]);
    });
    
    // Fallback: If they haven't used clock in but served items, count those days too
    Object.keys(dailyPerformance).forEach(day => daysWorkedSet.add(day));

    const totalDaysWorked = daysWorkedSet.size;

    return NextResponse.json({
      staff,
      attendance: attendance || [],
      performance: performanceArray,
      summary: {
        totalDaysWorked,
        totalRequests: requests?.length || 0,
        totalItems: items?.length || 0
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
