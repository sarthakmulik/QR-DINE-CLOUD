import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    // Verify plan access
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan")
      .eq("id", hotelId)
      .single();

    if (!hotel || hotel.plan.toLowerCase() === "basic") {
      return NextResponse.json({ error: "Coupons are locked under Basic plan." }, { status: 403 });
    }

    const { data: coupons, error } = await sb
      .from("coupons")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(coupons);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const body = await req.json();

    const { code, discountPercent, minBill, isActive } = body;
    if (!code || discountPercent === undefined) {
      return NextResponse.json({ error: "Missing coupon code or discount" }, { status: 400 });
    }

    const sb = createAdminClient();

    // Verify plan access
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan")
      .eq("id", hotelId)
      .single();

    if (!hotel || hotel.plan.toLowerCase() === "basic") {
      return NextResponse.json({ error: "Coupons are locked under Basic plan." }, { status: 403 });
    }

    const { data: coupon, error } = await sb
      .from("coupons")
      .insert({
        hotel_id: hotelId,
        code: String(code).trim().toUpperCase(),
        discount_percent: parseFloat(discountPercent),
        min_bill: parseFloat(minBill || 0),
        is_active: isActive ?? true,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A coupon with this code already exists for this hotel." }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json(coupon);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
