import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { assignOrderNumber } from "@/lib/session-service";
import type { Hotel } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const hotelId = url.searchParams.get("hotelId");
    const sessionId = url.searchParams.get("sessionId");

    if (!hotelId || !sessionId) {
      console.warn("PhonePe S2S callback missing hotelId/sessionId");
      return NextResponse.json({ error: "Missing context" }, { status: 400 });
    }

    // PhonePe sends the base64 encoded JSON in the 'response' key
    const rawBody = await req.json();
    const encodedResponse = rawBody.response;
    
    if (!encodedResponse) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const sb = createAdminClient();

    // 1. Fetch hotel credentials
    const { data: hotel } = await sb.from("hotels").select("payment_settings").eq("id", hotelId).single<Hotel>();
    if (!hotel || !hotel.payment_settings?.phonepe) {
      return NextResponse.json({ error: "Hotel not found or no phonepe config" }, { status: 404 });
    }

    const { salt_key, salt_index } = hotel.payment_settings.phonepe;

    // 2. Verify signature
    const xVerifyHeader = req.headers.get("x-verify");
    const calculatedVerify = crypto.createHash("sha256").update(encodedResponse + salt_key).digest("hex") + "###" + salt_index;
    
    if (xVerifyHeader !== calculatedVerify) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // 3. Decode response
    const decodedStr = Buffer.from(encodedResponse, "base64").toString("utf-8");
    const responsePayload = JSON.parse(decodedStr);

    if (!responsePayload.success || responsePayload.code !== "PAYMENT_SUCCESS") {
      return NextResponse.json({ status: "ignored, payment not successful" });
    }

    // 4. Process payment
    const { data: session } = await sb.from("table_sessions").select("status, payment_reference").eq("id", sessionId).single();
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "open") {
      return NextResponse.json({ success: true, message: "Already processed" });
    }

    await assignOrderNumber(sessionId);

    await sb.from("table_sessions").update({ 
      status: "open", 
      payment_method: "UPI",
      payment_reference: responsePayload.data?.transactionId || session.payment_reference
    }).eq("id", sessionId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PhonePe Webhook Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
