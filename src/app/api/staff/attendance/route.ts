export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { hotelId, user } = await requireHotelAccess();
    if (user.role !== "staff") {
      return NextResponse.json({ error: "Only staff can check attendance status" }, { status: 403 });
    }

    const sb = createAdminClient();

    // Check for an active (open) shift
    const { data: attendance, error } = await sb
      .from("staff_attendance")
      .select("*")
      .eq("staff_id", user.id)
      .eq("hotel_id", hotelId)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;

    return NextResponse.json({
      activeShift: attendance || null,
      isOnShift: !!attendance
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hotelId, user } = await requireHotelAccess();
    if (user.role !== "staff") {
      return NextResponse.json({ error: "Only staff can log attendance" }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body as { action: "clock_in" | "clock_out" };

    const sb = createAdminClient();

    if (action === "clock_in") {
      // Check if already clocked in
      const { data: existing } = await sb
        .from("staff_attendance")
        .select("id")
        .eq("staff_id", user.id)
        .is("clock_out", null)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "Already clocked in." }, { status: 400 });
      }

      const { data, error } = await sb
        .from("staff_attendance")
        .insert({
          hotel_id: hotelId,
          staff_id: user.id,
          clock_in: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    } 
    
    if (action === "clock_out") {
      // Find the open shift
      const { data: openShift } = await sb
        .from("staff_attendance")
        .select("id")
        .eq("staff_id", user.id)
        .is("clock_out", null)
        .maybeSingle();

      if (!openShift) {
        return NextResponse.json({ error: "No active shift found to clock out." }, { status: 400 });
      }

      const { data, error } = await sb
        .from("staff_attendance")
        .update({ clock_out: new Date().toISOString() })
        .eq("id", openShift.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}
