import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Hotel } from "@/lib/types";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string }> }
) {
  try {
    const params = await props.params;
    const hotelId = params.hotelId;

    if (!hotelId) {
      return NextResponse.json({ error: "Missing hotel ID" }, { status: 400 });
    }

    const { data: hotel, error } = await createAdminClient()
      .from("hotels")
      .select("name, kitchen_pin, plan")
      .eq("id", hotelId)
      .single<Hotel>();

    if (error || !hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    return NextResponse.json({
      name: hotel.name,
      hasPin: !!hotel.kitchen_pin,
      plan: hotel.plan,
    });
  } catch (err) {
    console.error("Error in public kitchen hotel route:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
