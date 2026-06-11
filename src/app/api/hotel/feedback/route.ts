import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    // Verify plan access
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan")
      .eq("id", hotelId)
      .single();

    if (!hotel || hotel.plan.toLowerCase() === "basic") {
      return NextResponse.json({ error: "Feedback reports are locked under Basic plan." }, { status: 403 });
    }

    const { data: feedback, error } = await sb
      .from("feedback")
      .select(`
        id,
        rating,
        comment,
        created_at,
        table_sessions (
          table_number
        )
      `)
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(feedback);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}
