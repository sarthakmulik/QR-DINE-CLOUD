import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import type { Hotel } from "@/lib/types";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await props.params;
    const body = await req.json();
    const { pin } = body as { pin: string };

    if (!pin || String(pin).length !== 4) {
      return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
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

    if (hotel.kitchen_pin !== pin) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // Generate secure token signature based on service role key (only known to backend)
    const salt = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback_salt";
    const token = crypto
      .createHash("sha256")
      .update(`${hotel.kitchen_pin}-${hotelId}-${salt}`)
      .digest("hex");

    return NextResponse.json({ success: true, token });
  } catch (err) {
    console.error("Error in kitchen PIN auth route:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
