import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTableSignature } from "@/lib/crypto";

const lastWaiterCalls = new Map<string, number>();

// Cleanup helper for expired table call keys
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of lastWaiterCalls.entries()) {
      if (now - timestamp > 60000) {
        lastWaiterCalls.delete(key);
      }
    }
  }, 60000);
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await props.params;
    const body = await req.json();
    const { tableNumber, signature } = body;

    const parsedTableNum = parseInt(tableNumber);
    if (isNaN(parsedTableNum) || parsedTableNum < 1) {
      return NextResponse.json({ error: "Invalid table number." }, { status: 400 });
    }

    // Enforce 30-second cooldown per table to block spammed waiter calls
    const callKey = `${hotelId}:${parsedTableNum}`;
    const lastCall = lastWaiterCalls.get(callKey);
    if (lastCall && Date.now() - lastCall < 30000) {
      const secondsLeft = Math.ceil((30000 - (Date.now() - lastCall)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${secondsLeft} seconds before calling the waiter again.` },
        { status: 429 }
      );
    }
    lastWaiterCalls.set(callKey, Date.now());

    const sb = createAdminClient();

    // 1. Verify plan access and secure_qr configuration
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan, secure_qr")
      .eq("id", hotelId)
      .single();

    if (!hotel) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }

    // Cryptographic Anti-Tampering Check
    if (hotel.secure_qr && !verifyTableSignature(hotelId, parsedTableNum, signature)) {
      return NextResponse.json({ error: "invalid_qr" }, { status: 403 });
    }

    const planLower = hotel.plan.toLowerCase();
    if (planLower === "basic") {
      return NextResponse.json(
        { error: "Call Waiter service is not enabled on this plan." },
        { status: 403 }
      );
    }

    // 2. Insert waiter request
    const { data: request, error } = await sb
      .from("waiter_requests")
      .insert({
        hotel_id: hotelId,
        table_number: parsedTableNum,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json(request);
  } catch (err: any) {
    console.error("Error calling waiter:", err);
    return NextResponse.json({ error: "Server error calling waiter." }, { status: 500 });
  }
}
