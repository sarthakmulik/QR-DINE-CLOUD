import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const sb = createAdminClient();

    const { data: updated, error } = await sb
      .from("table_sessions")
      .update({ status: "ready_for_pickup" })
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .select("*")
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: "Failed to mark ready" }, { status: 400 });
    }

    return NextResponse.json({ success: true, session: updated });
  } catch (err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
