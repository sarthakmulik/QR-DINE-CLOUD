import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidateTag } from "next/cache";
import { verifyKitchenToken } from "@/lib/kitchen-auth";

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

    if (!verifyKitchenToken(token, hotelId, hotel.kitchen_pin)) {
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
    
    revalidateTag(`kitchen-orders-${hotelId}`);
    revalidateTag(`staff-overview-${hotelId}`);
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Confirm payment error:", err);
    return NextResponse.json({ error: err.message || "Failed to confirm payment" }, { status: 500 });
  }
}
