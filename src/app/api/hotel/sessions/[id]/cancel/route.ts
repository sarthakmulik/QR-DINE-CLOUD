import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableSession } from "@/lib/types";

/**
 * POST /api/hotel/sessions/[id]/cancel
 * Cancels an unpaid quick-service session.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;

    const sb = createAdminClient();

    const { data: session } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle<TableSession>();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status !== "payment_pending") {
      return NextResponse.json({ error: "Only unpaid orders can be cancelled" }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data: cancelled } = await sb
      .from("table_sessions")
      .update({
        status: "cancelled",
        closed_at: now,
      })
      .eq("id", id)
      .select("*")
      .single<TableSession>();

    return NextResponse.json({
      success: true,
      session: cancelled,
    });
  } catch (e) {
    console.error("[Cancel Order] Error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to cancel order" },
      { status: 500 }
    );
  }
}
