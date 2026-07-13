import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Razorpay from "razorpay";
import crypto from "crypto";
import type { Hotel } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; tableNumber: string }> }
) {
  try {
    const { hotelId, tableNumber } = await params;
    const body = await req.json();
    const sessionId = body.sessionId;
    
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const sb = createAdminClient();

    // 1. Fetch Session & Hotel details
    const { data: session, error: sessionErr } = await sb
      .from("table_sessions")
      .select("*, session_items(*)")
      .eq("id", sessionId)
      .eq("hotel_id", hotelId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // ── Guard: only initiate payment for sessions that are awaiting it ──────
    // This prevents duplicate gateway orders if the customer taps the button
    // multiple times or retries after a failure.
    if (session.status !== "checkout_initiated" && session.status !== "bill_printed") {
      if (session.status === "closed") {
        // Payment was already verified (e.g. webhook beat the client)
        return NextResponse.json(
          { error: "Payment has already been completed for this order." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Order is not in a payable state." },
        { status: 400 }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const { data: hotel, error: hotelErr } = await sb
      .from("hotels")
      .select("*")
      .eq("id", hotelId)
      .single<Hotel>();

    if (hotelErr || !hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    const paymentSettings = hotel.payment_settings;
    if (!paymentSettings || paymentSettings.active_pg === "none") {
      return NextResponse.json({ error: "No active payment gateway configured" }, { status: 400 });
    }

    const totalAmount = Number(session.total);

    // 2. Razorpay Integration
    if (paymentSettings.active_pg === "razorpay" && paymentSettings.razorpay) {
      const { key_id, key_secret } = paymentSettings.razorpay;
      
      const instance = new Razorpay({
        key_id: key_id,
        key_secret: key_secret,
      });

      const options = {
        amount: Math.round(totalAmount * 100), // amount in smallest currency unit (paise)
        currency: "INR",
        receipt: sessionId.slice(0, 36),
        notes: {
          hotelId: hotelId,
          sessionId: sessionId,
        }
      };

      const order = await instance.orders.create(options);
      
      return NextResponse.json({
        gateway: "razorpay",
        order_id: order.id,
        amount: order.amount,
        key_id: key_id,
        hotel_name: hotel.name,
        currency: order.currency
      });
    }

    // 3. PhonePe Integration
    if (paymentSettings.active_pg === "phonepe" && paymentSettings.phonepe) {
      const { merchant_id, salt_key, salt_index, env } = paymentSettings.phonepe;
      
      const transactionId = `T${Date.now()}`;
      
      // Update session with transaction ID so we can verify it later
      await sb.from("table_sessions").update({ payment_reference: transactionId }).eq("id", sessionId);

      // Separate the headless S2S callback from the browser redirect
      const host = req.headers.get("host") || "localhost:3000";
      const protocol = host.includes("localhost") ? "http" : "https";
      const redirectUrl = `${protocol}://${host}/api/webhooks/phonepe/redirect?hotelId=${hotelId}&sessionId=${sessionId}`;
      const callbackUrl = `${protocol}://${host}/api/webhooks/phonepe/callback?hotelId=${hotelId}&sessionId=${sessionId}`;

      const payload = {
        merchantId: merchant_id,
        merchantTransactionId: transactionId,
        merchantUserId: `U${sessionId.slice(0, 30)}`,
        amount: Math.round(totalAmount * 100), // in paise
        redirectUrl: redirectUrl,
        redirectMode: "POST",
        callbackUrl: callbackUrl,
        paymentInstrument: {
          type: "PAY_PAGE"
        }
      };

      const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
      const stringToHash = base64Payload + "/pg/v1/pay" + salt_key;
      const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
      const xVerify = `${sha256}###${salt_index}`;

      const apiUrl = env === "PROD" 
        ? "https://api.phonepe.com/apis/hermes/pg/v1/pay"
        : "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay";

      const phonePeRes = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
        },
        body: JSON.stringify({ request: base64Payload })
      });

      const phonePeData = await phonePeRes.json();
      
      if (phonePeData.success) {
        return NextResponse.json({
          gateway: "phonepe",
          redirect_url: phonePeData.data.instrumentResponse.redirectInfo.url
        });
      } else {
        return NextResponse.json({ error: phonePeData.message || "PhonePe API Error" }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Invalid payment configuration" }, { status: 400 });
  } catch (err: any) {
    console.error("Payment initiation error:", err);
    const msg = err?.error?.description || err?.message || "Failed to initiate payment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
