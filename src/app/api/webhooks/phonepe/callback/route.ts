import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { assignOrderNumber } from "@/lib/session-service";
import type { Hotel } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const hotelId = url.searchParams.get("hotelId");
    const sessionIdUrl = url.searchParams.get("sessionId");

    if (!hotelId || !sessionIdUrl) {
      console.warn("PhonePe S2S callback missing hotelId/sessionId");
      return NextResponse.json({ error: "Missing context" }, { status: 400 });
    }

    const rawBody = await req.json();
    const encodedResponse = rawBody.response;
    
    if (!encodedResponse) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const sb = createAdminClient();

    const { data: hotel } = await sb.from("hotels").select("payment_settings").eq("id", hotelId).single<Hotel>();
    if (!hotel || !hotel.payment_settings?.phonepe) {
      return NextResponse.json({ error: "Hotel not found or no phonepe config" }, { status: 404 });
    }

    const { salt_key, salt_index } = hotel.payment_settings.phonepe;

    const xVerifyHeader = req.headers.get("x-verify");
    if (!xVerifyHeader) {
      console.warn("PhonePe S2S callback missing x-verify header");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const calculatedVerify = crypto.createHash("sha256").update(encodedResponse + salt_key).digest("hex") + "###" + salt_index;
    
    if (xVerifyHeader !== calculatedVerify) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const decodedStr = Buffer.from(encodedResponse, "base64").toString("utf-8");
    const responsePayload = JSON.parse(decodedStr);

    if (!responsePayload.success || responsePayload.code !== "PAYMENT_SUCCESS") {
      return NextResponse.json({ status: "ignored, payment not successful" });
    }

    const transactionId = responsePayload.data?.merchantTransactionId;
    if (!transactionId) {
      return NextResponse.json({ error: "Missing merchant transaction ID" }, { status: 400 });
    }

    // Use sessionId from URL, but verify it matches the transactionId we initiated
    const sessionId = sessionIdUrl;

    const { data: session } = await sb.from("table_sessions").select("status, payment_reference, payment_method, hotel_id").eq("id", sessionId).single();
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.hotel_id !== hotelId) {
      return NextResponse.json({ error: "Hotel ID mismatch" }, { status: 403 });
    }

    // Security Check: The PhonePe payload must correspond to the transaction we initiated for this session
    if (session.payment_reference !== transactionId) {
       console.warn(`Transaction ID mismatch for session ${sessionId}`);
       return NextResponse.json({ error: "Payment does not match this session" }, { status: 400 });
    }

    if (session.status === "open") {
      return NextResponse.json({ success: true, message: "Already processed" });
    }

    if (session.status === "checkout_initiated" || session.status === "bill_printed") {
      const { markAsPaid } = await import("@/lib/session-service");
      await markAsPaid(sessionId, session.payment_method ?? "UPI");
      return NextResponse.json({ success: true, message: "Dine-in order marked as paid" });
    }

    if (session.status !== "payment_pending" && session.status !== "draft") {
       return NextResponse.json({ status: "ignored, session is not in a payable state", current_status: session.status });
    }

    await assignOrderNumber(sessionId);

    const { data: updated, error: updateError } = await sb.from("table_sessions").update({ 
      status: "open", 
      payment_method: session.payment_method ?? "UPI",
      payment_reference: responsePayload.data?.transactionId || session.payment_reference
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
    console.error("PhonePe Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
