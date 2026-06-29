import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { assignOrderNumber } from "@/lib/session-service";
import type { Hotel } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; sessionId: string }> }
) {
  try {
    const { hotelId, sessionId } = await params;
    const body = await req.json();
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
      
      const generated_signature = crypto
        .createHmac("sha256", razorpay.key_secret)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");

      if (generated_signature !== razorpay_signature) {
        return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
      }

      // Fetch the session to get the actual payment_method (UPI or Card)
      // so we don't accidentally overwrite a Card payment as UPI
      const { data: session } = await sb
        .from("table_sessions")
        .select("payment_method")
        .eq("id", sessionId)
        .single();

      // Assign the order number strictly upon successful verification
      const orderNumber = await assignOrderNumber(sessionId);

      // Mark session as open — preserve the original payment_method set at checkout
      await sb.from("table_sessions").update({ 
        status: "open", 
        // Preserve whichever method the customer chose (UPI or Card).
        // Only update if the session doesn't already have one (safety fallback).
        payment_method: session?.payment_method ?? "UPI",
        payment_reference: razorpay_payment_id
      }).eq("id", sessionId);

      return NextResponse.json({ success: true, order_number: orderNumber });
    }

    // --- PHONEPE VERIFICATION ---
    if (active_pg === "phonepe" && phonepe && body.gateway === "phonepe") {
      const { merchant_id, salt_key, salt_index, env } = phonepe;
      
      // We need the transaction ID from the session to check its status
      const { data: session } = await sb
        .from("table_sessions")
        .select("payment_reference, payment_method")
        .eq("id", sessionId)
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

      if (phonePeData.success && phonePeData.code === "PAYMENT_SUCCESS") {
        const orderNumber = await assignOrderNumber(sessionId);
        
        await sb.from("table_sessions").update({ 
          status: "open", 
          // Preserve the original payment_method (UPI or Card) set at checkout
          payment_method: session.payment_method ?? "UPI",
        }).eq("id", sessionId);
        
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
