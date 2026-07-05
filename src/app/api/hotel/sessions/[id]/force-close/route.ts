import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateSessionTotals } from "@/lib/session-service";
import type { TableSession } from "@/lib/types";

/**
 * POST /api/hotel/sessions/[id]/force-close
 * Force-closes a stuck/orphaned session and logs the action to session_audit.
 * Only available to the hotel owner who owns the session.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Manually force-closed by hotel staff";

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

    if (session.status === "closed") {
      return NextResponse.json({ error: "Session is already closed" }, { status: 400 });
    }

    // Recalculate totals before closing to ensure accuracy
    await recalculateSessionTotals(id);

    const now = new Date().toISOString();

    const { data: closed } = await sb
      .from("table_sessions")
      .update({
        status: "closed",
        closed_at: now,
        end_time: now,
      })
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .select("*")
      .single<TableSession>();

    // Clear the table's current session pointer
    await sb
      .from("restaurant_tables")
      .update({ current_session_id: null })
      .eq("id", session.table_id);

    // Write to audit log
    await sb.from("session_audit").insert({
      session_id: id,
      hotel_id: hotelId,
      action: "force_closed",
      reason,
    });

    return NextResponse.json({
      success: true,
      session: closed,
      closedAt: now,
    });
  } catch (e) {
    console.error("[Force Close] Error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to force close session" },
      { status: 500 }
    );
  }
}
