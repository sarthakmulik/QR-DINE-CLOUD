import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await props.params;
    const body = await req.json();
    const { code, subtotal } = body;

    if (!code) {
      return NextResponse.json({ error: "Coupon code is required." }, { status: 400 });
    }

    const sb = createAdminClient();

    // Parallel: validate hotel plan AND fetch coupon in one round-trip
    const [hotelRes, couponRes] = await Promise.all([
      sb.from("hotels").select("plan").eq("id", hotelId).single(),
      sb.from("coupons").select("*").eq("hotel_id", hotelId).eq("code", String(code).trim().toUpperCase()).eq("is_active", true).maybeSingle(),
    ]);

    const hotel = hotelRes.data;
    if (!hotel) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }
    if (hotel.plan.toLowerCase() === "basic") {
      return NextResponse.json({ error: "Coupons are not enabled on this plan." }, { status: 403 });
    }

    const coupon = couponRes.data;
    if (couponRes.error || !coupon) {
      return NextResponse.json({ error: "Invalid coupon code." }, { status: 400 });
    }

    const billAmt = parseFloat(subtotal || 0);
    if (billAmt < Number(coupon.min_bill)) {
      return NextResponse.json(
        { error: `Coupon requires a minimum order value of ₹${coupon.min_bill}.` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      discountPercent: Number(coupon.discount_percent),
      minBill: Number(coupon.min_bill),
    });
  } catch (err: any) {
    console.error("Error validating coupon:", err);
    return NextResponse.json({ error: "Server error validating coupon." }, { status: 500 });
  }
}
