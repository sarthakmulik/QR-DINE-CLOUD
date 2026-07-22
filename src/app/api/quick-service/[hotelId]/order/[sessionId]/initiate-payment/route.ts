import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Razorpay from "razorpay";
import crypto from "crypto";
import type { Hotel } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; sessionId: string }> }
) {
  try {
    const { hotelId, sessionId } = await params;
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
    if (session.status !== "payment_pending") {
      if (session.status === "open") {
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
    if (!totalAmount || totalAmount <= 0) {
      return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
    }

    // 2. Razorpay Integration
    if (paymentSettings.active_pg === "razorpay" && paymentSettings.razorpay) {
      const { key_id, key_secret } = paymentSettings.razorpay;
      if (!key_id || !key_secret) {
        return NextResponse.json({ error: "Razorpay keys not configured properly" }, { status: 400 });
      }
      
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
      
      // Use crypto UUID to guarantee no collisions under concurrent load
      const transactionId = `T${crypto.randomUUID().replace(/-/g, '').slice(0, 30)}`;
      
      const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) {
        return NextResponse.json({ error: "APP_URL is required for PhonePe payments" }, { status: 500 });
      }
      const redirectUrl = `${appUrl}/api/webhooks/phonepe/redirect?hotelId=${hotelId}&sessionId=${sessionId}`;
      const callbackUrl = `${appUrl}/api/webhooks/phonepe/callback?hotelId=${hotelId}&sessionId=${sessionId}`;

      const payload = {
        merchantId: merchant_id,
        merchantTransactionId: transactionId,
        merchantUserId: `U${sessionId.slice(0, 30)}`,
        amount: Math.round(totalAmount * 100), // in paise
        redirectUrl: redirectUrl,
        redirectMode: "POST",
        callbackUrl: callbackUrl,
        paymentInstrument: {
          type: "UPI_QR"
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
        const qrData = phonePeData.data?.instrumentResponse?.qrData;
        if (!qrData) {
           return NextResponse.json({ error: "Missing QR Data from PhonePe" }, { status: 400 });
        }

        // ONLY write payment_reference to DB if PhonePe call succeeded
        await sb.from("table_sessions").update({ payment_reference: transactionId }).eq("id", sessionId);

        return NextResponse.json({
          gateway: "phonepe",
          native_upi: true,
          qr_data: qrData,
          sessionId: sessionId
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
