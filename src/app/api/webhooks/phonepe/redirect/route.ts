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
      let redirectTarget = `/dine/${hotelId}`; // default for Quick Service

      if (session && (session.status === "checkout_initiated" || session.status === "bill_printed")) {
        const tableNumber = (session as any).restaurant_tables?.table_number;
        verifyEndpoint = `${baseUrl}/api/dine/${hotelId}/${tableNumber}/verify-payment`;
        if (tableNumber) {
          redirectTarget = `/dine/${hotelId}/${tableNumber}`;
        }
      } else {
        verifyEndpoint = `${baseUrl}/api/quick-service/${hotelId}/order/${sessionId}/verify-payment`;
      }

      const verifyRes = await fetch(verifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway: "phonepe", sessionId })
      });
      
      // We must use 303 (See Other) because PhonePe sends a POST to this webhook.
      // A 307 redirect preserves the POST method, which causes a Vercel 502 BAD_GATEWAY
      // (ROUTER_CANNOT_MATCH) when the browser tries to POST to a Next.js page route.
      // 303 forces the browser to switch to a GET request.
      if (verifyRes.ok) {
        return NextResponse.redirect(new URL(`${redirectTarget}?payment=success&session=${sessionId}`, req.url), 303);
      } else {
        return NextResponse.redirect(new URL(`${redirectTarget}?payment=failed&session=${sessionId}`, req.url), 303);
      }
    } catch (e) {
      return NextResponse.redirect(new URL(`/dine/${hotelId}?payment=failed&session=${sessionId}`, req.url), 303);
    }

  } catch (err) {
    console.error("PhonePe Webhook Error:", err);
    return NextResponse.redirect(new URL("/error", req.url), 303);
  }
}
