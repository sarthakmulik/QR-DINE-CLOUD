import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await props.params;
    const body = await req.json();

    const updates: Record<string, any> = {};
    if (body.code !== undefined) updates.code = String(body.code).trim().toUpperCase();
    if (body.discountPercent !== undefined) updates.discount_percent = parseFloat(body.discountPercent);
    if (body.minBill !== undefined) updates.min_bill = parseFloat(body.minBill);
    if (body.isActive !== undefined) updates.is_active = body.isActive;

    const sb = createAdminClient();

    const { data: coupon, error } = await sb
      .from("coupons")
      .update(updates)
      .eq("id", id)
      .eq("hotel_id", hotelId)
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

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await props.params;

    const sb = createAdminClient();

    const { error } = await sb
      .from("coupons")
      .delete()
      .eq("id", id)
      .eq("hotel_id", hotelId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
