import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id: sessionId } = await params;

    const sb = createAdminClient();

    // Verify session
    const { data: session, error: sessionErr } = await sb
      .from("table_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .eq("hotel_id", hotelId)
      .single();
      
    if (sessionErr || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    
    if (session.status !== "payment_pending") {
      return NextResponse.json({ error: "Order is not awaiting payment" }, { status: 400 });
    }
    
    // Accept payment -> send to kitchen queue
    const { error: updateErr } = await sb
      .from("table_sessions")
      .update({ status: "open" })
      .eq("id", sessionId);
      
    if (updateErr) {
      throw new Error(updateErr.message);
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Confirm payment error:", err);
    return NextResponse.json({ error: err.message || "Failed to confirm payment" }, { status: 500 });
  }
}
