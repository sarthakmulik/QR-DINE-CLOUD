import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; sessionId: string }> }
) {
  try {
    const { sessionId, hotelId } = await params;
    const sb = createAdminClient();

    const { data: session } = await sb
      .from("table_sessions")
      .select("status, payment_reference, id, order_number")
      .eq("id", sessionId)
      .eq("hotel_id", hotelId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ 
      id: session.id,
      status: session.status,
      payment_reference: session.payment_reference,
      order_number: session.order_number
    });
  } catch (err) {
    console.error("Status polling error:", err);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
