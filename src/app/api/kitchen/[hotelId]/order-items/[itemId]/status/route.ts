import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import webpush from "web-push";

// Removed local webpush configuration since we will use centralized push logic

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string; itemId: string }> }
) {
  try {
    const { hotelId, itemId } = await props.params;
    const body = await req.json();

    const token = req.headers.get("x-kitchen-token");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createAdminClient();

    // Verify token using hotel pin
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
    const { status } = body as { status: "preparing" | "ready" | "served" };

    if (!status || !["preparing", "ready", "served"].includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    // Verify item belongs to session items and the hotel
    const { data: item, error: selectError } = await sb
      .from("session_items")
      .select(`
        id,
        session_id,
        table_sessions (
          hotel_id
        )
      `)
      .eq("id", itemId)
      .single();

    if (selectError || !item) {
      return NextResponse.json({ error: "Order item not found" }, { status: 404 });
    }

    // Verify session belongs to this hotel
    const sessionData = item.table_sessions as any;
    const sessionHotelId = sessionData?.hotel_id;
    if (sessionHotelId !== hotelId) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    // Update status
    const { data: updated, error: updateError } = await sb
      .from("session_items")
      .update({ status })
      .eq("id", itemId)
      .select("*")
      .single();

    if (updateError) throw updateError;

    // Auto-update session status to ready_for_pickup if applicable
    if (status === "ready" || status === "served") {
      const sessionId = item.session_id;
      // Get all items in the session
      const { data: allItems } = await sb
        .from("session_items")
        .select("status")
        .eq("session_id", sessionId);

      if (allItems && allItems.length > 0) {
        const allReady = allItems.every(i => i.status === "ready" || i.status === "served");
        if (allReady) {
          // Check if it's quick service (table_number is null)
          const { data: session } = await sb
            .from("table_sessions")
            .select("table_number, status")
            .eq("id", sessionId)
            .single();

          if (session && session.table_number === null && session.status === "open") {
            await sb
              .from("table_sessions")
              .update({ status: "ready_for_pickup" })
              .eq("id", sessionId);
          }
        }
      }

      // Send Push Notification to Waiters only when it is 'ready'
      if (status === "ready") {
        const { data: sessionDataObj } = await sb
          .from("table_sessions")
          .select("table_number")
          .eq("id", item.session_id)
          .single();

        if (sessionDataObj?.table_number) {
          const { sendStaffPushSequential } = await import("@/lib/push");
          await sendStaffPushSequential(hotelId, {
            title: "Order Ready 🍽️",
            body: `Table ${sessionDataObj.table_number} — ${updated.name} is ready for pickup!`,
            tag: `ready-${item.id}`,
            url: `/staff/${hotelId}?tab=orders`
          });
        }
      }
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("Error updating order item status:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
