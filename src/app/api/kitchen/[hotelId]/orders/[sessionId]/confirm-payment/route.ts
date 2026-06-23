import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; sessionId: string }> }
) {
  try {
    const { hotelId, sessionId } = await params;
    
    const token = req.headers.get("x-kitchen-token");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createAdminClient();

    // Verify signature
    const { data: hotel } = await sb
      .from("hotels")
      .select("kitchen_pin")
      .eq("id", hotelId)
      .single();

    if (!hotel || !hotel.kitchen_pin) {
      return NextResponse.json({ error: "Kitchen PIN is not configured" }, { status: 400 });
    }

    const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback_salt";
    const expectedToken = crypto
      .createHash("sha256")
      .update(`${hotel.kitchen_pin}-${hotelId}-${salt}`)
      .digest("hex");

    if (token !== expectedToken) {
      return NextResponse.json({ error: "Forbidden: Invalid token" }, { status: 403 });
    }

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
