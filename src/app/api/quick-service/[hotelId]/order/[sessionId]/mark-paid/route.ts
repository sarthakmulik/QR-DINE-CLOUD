import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; sessionId: string }> }
) {
  try {
    const { hotelId, sessionId } = await params;
    
    const sb = createAdminClient();
    
    // Verify session belongs to hotel and is pending payment
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
    
    // We explicitly DO NOT update the status to 'open' here.
    // The admin must manually click "Confirm Paid" in the dashboard.
    // This prevents fake users from bypassing payment.
    
    return NextResponse.json({ success: true, message: "Awaiting admin verification" });
  } catch (err: any) {
    console.error("Mark paid error:", err);
    return NextResponse.json({ error: err.message || "Failed to mark paid" }, { status: 500 });
  }
}
