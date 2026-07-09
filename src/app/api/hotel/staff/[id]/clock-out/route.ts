export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string; id: string }> }
) {
  try {
    const { hotelId, user } = await requireHotelAccess();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Only admins can perform this action" }, { status: 403 });
    }

    const { id: staffId } = await props.params;
    const sb = createAdminClient();

    // Verify staff belongs to this hotel
    const { data: staff, error: staffError } = await sb
      .from("staff")
      .select("id")
      .eq("id", staffId)
      .eq("hotel_id", hotelId)
      .single();

    if (staffError || !staff) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    // Force close all open shifts for this staff
    const { error: updateError } = await sb
      .from("staff_attendance")
      .update({ clock_out: new Date().toISOString() })
      .eq("staff_id", staffId)
      .eq("hotel_id", hotelId)
      .is("clock_out", null);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Force clock out error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
