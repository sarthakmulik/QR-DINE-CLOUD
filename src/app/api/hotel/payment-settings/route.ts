import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Hotel } from "@/lib/types";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const { data: hotel, error } = await sb
      .from("hotels")
      .select("payment_settings")
      .eq("id", hotelId)
      .single<Hotel>();

    if (error || !hotel) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Return the raw payment_settings because this is an admin route
    return NextResponse.json(hotel.payment_settings || {});
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const body = await req.json();
    const sb = createAdminClient();

    const { data: currentHotel, error: getError } = await sb
      .from("hotels")
      .select("payment_settings")
      .eq("id", hotelId)
      .single<Hotel>();

    if (getError || !currentHotel) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const currentSettings = currentHotel.payment_settings || {};
    
    // Only allow specific updates
    const newSettings = { ...currentSettings };

    if (body.active_pg !== undefined) {
      newSettings.active_pg = body.active_pg;
    }

    if (body.razorpay !== undefined) {
      newSettings.razorpay = {
        ...(currentSettings.razorpay || {}),
        ...body.razorpay
      };
    }

    if (body.phonepe !== undefined) {
      newSettings.phonepe = {
        ...(currentSettings.phonepe || {}),
        ...body.phonepe
      };
    }

    const { error: updateError } = await sb
      .from("hotels")
      .update({ payment_settings: newSettings })
      .eq("id", hotelId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, payment_settings: newSettings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}
