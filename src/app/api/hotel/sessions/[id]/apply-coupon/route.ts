import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateSessionTotals } from "@/lib/session-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const body = await req.json();
    const { code } = body;

    const sb = createAdminClient();

    // 1. Fetch active session
    const { data: session } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "closed") {
      return NextResponse.json({ error: "Session is already closed" }, { status: 400 });
    }

    // 2. If code is provided, validate coupon
    let discountPercent = 0;
    let couponCode = null;

    if (code) {
      const { data: coupon, error: couponErr } = await sb
        .from("coupons")
        .select("*")
        .eq("hotel_id", hotelId)
        .eq("code", String(code).trim().toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (couponErr || !coupon) {
        return NextResponse.json({ error: "Invalid or inactive coupon code." }, { status: 400 });
      }

      // Validate minimum bill against subtotal
      if (Number(session.subtotal) < Number(coupon.min_bill)) {
        return NextResponse.json({
          error: `Coupon requires a minimum order value of ₹${coupon.min_bill}.`
        }, { status: 400 });
      }

      discountPercent = Number(coupon.discount_percent);
      couponCode = coupon.code;
    }

    // 3. Update session coupon details
    const { error: updateErr } = await sb
      .from("table_sessions")
      .update({
        coupon_code: couponCode,
        discount_percent: discountPercent
      })
      .eq("id", id);

    if (updateErr) throw updateErr;

    // 4. Recalculate totals
    const updated = await recalculateSessionTotals(id);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to apply coupon" },
      { status: 500 }
    );
  }
}
