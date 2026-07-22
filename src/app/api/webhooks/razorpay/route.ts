import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Razorpay from "razorpay";
import { assignOrderNumber } from "@/lib/session-service";
import type { Hotel } from "@/lib/types";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      console.warn("[Razorpay Webhook] Missing X-Razorpay-Signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const event = body.event;
    
    if (event !== "order.paid" && event !== "payment.captured") {
      return NextResponse.json({ status: "ignored" });
    }

    const entity = body.payload?.payment?.entity || body.payload?.order?.entity;
    if (!entity) {
      return NextResponse.json({ error: "Missing entity in payload" }, { status: 400 });
    }

    const orderId = entity.order_id || entity.id;
    if (!orderId) {
      return NextResponse.json({ error: "Missing order_id in payload" }, { status: 400 });
    }

    const hotelId = entity.notes?.hotelId;
    const sessionId = entity.notes?.sessionId;

    if (!hotelId || !sessionId) {
      console.warn("Webhook received without hotelId/sessionId notes", orderId);
      return NextResponse.json({ error: "Missing notes" }, { status: 400 });
    }

    const sb = createAdminClient();

    // In this architecture, each hotel brings their own Razorpay account API keys.
    // We MUST fetch the hotel from the DB first to get their specific key_secret
    // in order to verify the webhook signature. (Read-only DB op, safe from mutation attacks).
    const { data: hotel } = await sb
      .from("hotels")
      .select("payment_settings")
      .eq("id", hotelId)
      .single<Hotel>();

    if (!hotel || !hotel.payment_settings?.razorpay) {
      return NextResponse.json({ error: "Hotel not found or no razorpay config" }, { status: 404 });
    }

    const { key_id, key_secret } = hotel.payment_settings.razorpay;

    // Verify signature using the hotel's key_secret
    const expectedSig = crypto
      .createHmac("sha256", key_secret)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSig) {
      console.warn(`[Razorpay Webhook] Signature mismatch for hotel ${hotelId} — possible forged request`);
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    // Verify order status via the Razorpay API (double-check)
    const instance = new Razorpay({ key_id, key_secret });
    const order = await instance.orders.fetch(orderId);

    if (order.status !== "paid") {
      return NextResponse.json({ status: "ignored, order not paid" });
    }

    const { data: session } = await sb
      .from("table_sessions")
      .select("status, payment_method")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "open") {
      return NextResponse.json({ success: true, message: "Already processed" });
    }

    if (session.status === "checkout_initiated" || session.status === "bill_printed") {
      // Dine-in: Mark session as paid (closes it)
      const { markAsPaid } = await import("@/lib/session-service");
      await markAsPaid(sessionId, session.payment_method ?? "UPI");
      return NextResponse.json({ success: true, message: "Dine-in order marked as paid" });
    }

    // Protect against cancelled or closed sessions being re-opened as QS
    if (session.status !== "payment_pending" && session.status !== "draft") {
       return NextResponse.json({ status: "ignored, session is not in a payable state", current_status: session.status });
    }

    await assignOrderNumber(sessionId);

    // Atomic update to ensure idempotency for Quick Service
    const { data: updated, error: updateError } = await sb.from("table_sessions").update({ 
      status: "open", 
      payment_method: session.payment_method ?? "UPI",
      payment_reference: entity.id
    })
    .eq("id", sessionId)
    .neq("status", "open")
    .select("id")
    .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!updated) {
       return NextResponse.json({ success: true, message: "Already processed" });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Razorpay Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
