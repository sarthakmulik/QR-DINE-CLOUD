import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Razorpay from "razorpay";
import { assignOrderNumber } from "@/lib/session-service";
import type { Hotel } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    // ── Signature Verification ────────────────────────────────────────────────
    // CRITICAL: Verify the X-Razorpay-Signature header BEFORE processing the
    // webhook body. Without this anyone can POST a fake "payment.captured"
    // event to mark orders as paid without actually paying.
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

    const orderId = body.payload?.payment?.entity?.order_id || body.payload?.order?.entity?.id;
    if (!orderId) {
      return NextResponse.json({ error: "Missing order_id in payload" }, { status: 400 });
    }

    const sb = createAdminClient();

    const entity = body.payload?.payment?.entity || body.payload?.order?.entity;
    const hotelId = entity?.notes?.hotelId;
    const sessionId = entity?.notes?.sessionId;

    if (!hotelId || !sessionId) {
      console.warn("Webhook received without hotelId/sessionId notes", orderId);
      return NextResponse.json({ error: "Missing notes" }, { status: 400 });
    }

    const { data: hotel } = await sb
      .from("hotels")
      .select("payment_settings")
      .eq("id", hotelId)
      .single<Hotel>();

    if (!hotel || !hotel.payment_settings?.razorpay) {
      return NextResponse.json({ error: "Hotel not found or no razorpay config" }, { status: 404 });
    }

    const { key_id, key_secret } = hotel.payment_settings.razorpay;

    // Verify signature using the webhook secret.
    // Razorpay signs with a dedicated webhook secret (separate from key_secret).
    // Prefer RAZORPAY_WEBHOOK_SECRET env var; fall back to key_secret for
    // setups that haven't configured a dedicated webhook secret yet.
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || key_secret;
    const expectedSig = require("crypto")
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSig) {
      console.warn("[Razorpay Webhook] Signature mismatch — possible forged request");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }
    // ─────────────────────────────────────────────────────────────────────────

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

    await assignOrderNumber(sessionId);

    await sb.from("table_sessions").update({ 
      status: "open", 
      // Preserve the payment_method set at checkout (UPI or Card)
      payment_method: session.payment_method ?? "UPI",
      payment_reference: entity.id
    }).eq("id", sessionId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Razorpay Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
