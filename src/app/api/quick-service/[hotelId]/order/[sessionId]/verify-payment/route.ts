import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import Razorpay from "razorpay";
import { assignOrderNumber } from "@/lib/session-service";
import type { Hotel } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; sessionId: string }> }
) {
  try {
    const { hotelId, sessionId } = await params;
    
    let body: any;
    try {
      body = await req.json();
    } catch {
       return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || !body.gateway) {
       return NextResponse.json({ error: "Missing gateway in request body" }, { status: 400 });
    }

    const sb = createAdminClient();

    const { data: hotel } = await sb
      .from("hotels")
      .select("payment_settings")
      .eq("id", hotelId)
      .single<Hotel>();

    if (!hotel || !hotel.payment_settings) {
      return NextResponse.json({ error: "Gateway not configured" }, { status: 400 });
    }

    const { active_pg, razorpay, phonepe } = hotel.payment_settings;

    // --- RAZORPAY VERIFICATION ---
    if (active_pg === "razorpay" && razorpay && body.gateway === "razorpay") {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;
      
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return NextResponse.json({ error: "Missing Razorpay verification parameters" }, { status: 400 });
      }

      const generated_signature = crypto
        .createHmac("sha256", razorpay.key_secret)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");

      if (generated_signature !== razorpay_signature) {
        return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
      }

      const { data: session } = await sb
        .from("table_sessions")
        .select("payment_method, total, status")
        .eq("id", sessionId)
        .eq("hotel_id", hotelId) // Security Fix: Guard with hotelId
        .eq("status", "payment_pending")
        .single();

      if (!session) {
         return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const razorpayOrder = await new Razorpay({ key_id: razorpay.key_id, key_secret: razorpay.key_secret })
        .orders.fetch(razorpay_order_id);
      if (
        razorpayOrder.status !== "paid" ||
        razorpayOrder.notes?.hotelId !== hotelId ||
        razorpayOrder.notes?.sessionId !== sessionId ||
        Number(razorpayOrder.amount) !== Math.round(Number(session.total) * 100)
      ) {
        return NextResponse.json({ error: "Payment does not match this order" }, { status: 400 });
      }

      // Mark session as open FIRST
      const { data: updated, error: updateError } = await sb.from("table_sessions").update({ 
        status: "open", 
        payment_method: session.payment_method ?? "UPI",
        payment_reference: razorpay_payment_id
      })
      .eq("id", sessionId)
      .neq("status", "open")
      .select("id")
      .maybeSingle();

      if (updateError) throw updateError;

      // Only assign order number if WE actually opened it
      let orderNumber;
      if (updated) {
        orderNumber = await assignOrderNumber(sessionId);
      } else {
        // Find existing order number if already processed
        const { data: existing } = await sb.from("table_sessions").select("order_number").eq("id", sessionId).single();
        orderNumber = existing?.order_number;
      }

      return NextResponse.json({ success: true, order_number: orderNumber });
    }

    // --- PHONEPE VERIFICATION ---
    if (active_pg === "phonepe" && phonepe && body.gateway === "phonepe") {
      const { merchant_id, salt_key, salt_index, env } = phonepe;
      
      const { data: session } = await sb
        .from("table_sessions")
        .select("payment_reference, payment_method, status")
        .eq("id", sessionId)
        .eq("hotel_id", hotelId) // Security Fix: Guard with hotelId
        .eq("status", "payment_pending")
        .single();
        
      if (!session || !session.payment_reference) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 400 });
      }

      const transactionId = session.payment_reference;
      
      const stringToHash = `/pg/v1/status/${merchant_id}/${transactionId}${salt_key}`;
      const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
      const xVerify = `${sha256}###${salt_index}`;

      const apiUrl = env === "PROD" 
        ? `https://api.phonepe.com/apis/hermes/pg/v1/status/${merchant_id}/${transactionId}`
        : `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${merchant_id}/${transactionId}`;

      const phonePeRes = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-MERCHANT-ID": merchant_id
        }
      });

      const phonePeData = await phonePeRes.json();

      if (
        phonePeData.success &&
        phonePeData.code === "PAYMENT_SUCCESS" &&
        phonePeData.data?.merchantTransactionId === transactionId
      ) {
        const phonePeActualTransactionId = phonePeData.data?.transactionId || transactionId;

        // Mark session as open FIRST
        const { data: updated, error: updateError } = await sb.from("table_sessions").update({ 
          status: "open", 
          payment_method: session.payment_method ?? "UPI",
          payment_reference: phonePeActualTransactionId
        })
        .eq("id", sessionId)
        .neq("status", "open")
        .select("id")
        .maybeSingle();

        if (updateError) throw updateError;

        let orderNumber;
        if (updated) {
          orderNumber = await assignOrderNumber(sessionId);
        } else {
          const { data: existing } = await sb.from("table_sessions").select("order_number").eq("id", sessionId).single();
          orderNumber = existing?.order_number;
        }
        
        return NextResponse.json({ success: true, order_number: orderNumber });
      } else {
        return NextResponse.json({ error: phonePeData.message || "Payment not successful" }, { status: 400 });
      }
    }

    return NextResponse.json({ error: "Invalid payment verification request" }, { status: 400 });
  } catch (err: any) {
    console.error("Payment verification error:", err);
    return NextResponse.json({ error: err.message || "Failed to verify payment" }, { status: 500 });
  }
}
