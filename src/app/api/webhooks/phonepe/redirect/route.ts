import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const hotelId = url.searchParams.get("hotelId");
    const sessionId = url.searchParams.get("sessionId");

    if (!hotelId || !sessionId) {
      return NextResponse.redirect(new URL("/error", req.url));
    }

    // Since this is just a redirect back to the app, the QuickServiceClient
    // will need a way to know it should check the status of a specific session.
    // However, QuickServiceClient doesn't have a specific "checking payment" state
    // stored in the URL.
    // Let's verify the payment right here on the server before redirecting!

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // Look up session to see if it's Dine-In or Quick Service
    const sb = createAdminClient();
    const { data: session } = await sb.from("table_sessions").select("status, table_id, restaurant_tables(table_number)").eq("id", sessionId).single();

    try {
      let verifyEndpoint = "";
      if (session && (session.status === "checkout_initiated" || session.status === "bill_printed")) {
        const tableNumber = (session as any).restaurant_tables?.table_number;
        verifyEndpoint = `${baseUrl}/api/dine/${hotelId}/${tableNumber}/verify-payment`;
      } else {
        verifyEndpoint = `${baseUrl}/api/quick-service/${hotelId}/order/${sessionId}/verify-payment`;
      }

      const verifyRes = await fetch(verifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway: "phonepe", sessionId })
      });
      
      // We redirect back to the Dine page with a success or error query param
      if (verifyRes.ok) {
        return NextResponse.redirect(new URL(`/dine/${hotelId}?payment=success&session=${sessionId}`, req.url));
      } else {
        return NextResponse.redirect(new URL(`/dine/${hotelId}?payment=failed&session=${sessionId}`, req.url));
      }
    } catch (e) {
      return NextResponse.redirect(new URL(`/dine/${hotelId}?payment=failed&session=${sessionId}`, req.url));
    }

  } catch (err) {
    console.error("PhonePe Webhook Error:", err);
    return NextResponse.redirect(new URL("/error", req.url));
  }
}
