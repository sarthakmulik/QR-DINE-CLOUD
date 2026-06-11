import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await props.params;
    const body = await req.json();
    const { status } = body as { status: "pending" | "completed" };

    if (!status || !["pending", "completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const sb = createAdminClient();

    // Verify request belongs to hotel
    const { data: request, error: fetchErr } = await sb
      .from("waiter_requests")
      .select("hotel_id")
      .eq("id", id)
      .single();

    if (fetchErr || !request || request.hotel_id !== hotelId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { data: updated, error: updateErr } = await sb
      .from("waiter_requests")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
