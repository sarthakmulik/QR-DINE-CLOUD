import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Hotel } from "@/lib/types";
import { checkLoginRateLimit, recordLoginFailure, resetLoginAttempts } from "@/lib/rate-limit";
import { createKitchenToken, hashKitchenPin, isKitchenPinHash, verifyKitchenPin } from "@/lib/kitchen-auth";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await props.params;
    const body = await req.json();
    const { pin } = body as { pin: string };
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const rateLimitKey = `kitchen:${hotelId}:${ip}`;

    if (!pin || String(pin).length !== 4) {
      return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
    }

    const limit = await checkLoginRateLimit(rateLimitKey);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many PIN attempts. Please try again in ${Math.ceil(limit.lockTimeLeft / 60)} minutes.` },
        { status: 429 }
      );
    }

    const sb = createAdminClient();
    const { data: hotel, error } = await sb
      .from("hotels")
      .select("kitchen_pin")
      .eq("id", hotelId)
      .single<Hotel>();

    if (error || !hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    if (!hotel.kitchen_pin) {
      return NextResponse.json({ error: "Kitchen PIN is not configured" }, { status: 400 });
    }

    if (!(await verifyKitchenPin(pin, hotel.kitchen_pin))) {
      await recordLoginFailure(rateLimitKey);
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    await resetLoginAttempts(rateLimitKey);

    let pinHash = hotel.kitchen_pin;
    if (!isKitchenPinHash(pinHash)) {
      pinHash = await hashKitchenPin(pin);
      const { error: updateError } = await sb.from("hotels").update({ kitchen_pin: pinHash }).eq("id", hotelId);
      if (updateError) throw updateError;
    }

    const { token, expiresAt } = createKitchenToken(hotelId, pinHash);

    return NextResponse.json({ success: true, token, expiresAt });
  } catch (err) {
    console.error("Error in kitchen PIN auth route:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
