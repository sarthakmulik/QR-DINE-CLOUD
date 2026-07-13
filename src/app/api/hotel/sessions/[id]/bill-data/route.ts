import { createAdminClient } from "@/lib/supabase/admin";
import { requireHotelAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const sb = createAdminClient();

    const { data: session, error: sErr } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle();

    if (sErr || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "closed") {
      return NextResponse.json({ error: "Session is already closed" }, { status: 400 });
    }

    const { data: items } = await sb
      .from("session_items")
      .select("*")
      .eq("session_id", id)
      .order("added_at", { ascending: true });

    const { data: hotel } = await sb
      .from("hotels")
      .select("*")
      .eq("id", hotelId)
      .single();

    const { data: table } = await sb
      .from("restaurant_tables")
      .select("*")
      .eq("id", session.table_id)
      .maybeSingle();

    // Recalculate totals fresh (same logic as printBill)
    const sessionItems = items || [];
    const subtotal = sessionItems.reduce(
      (sum: number, item: any) => sum + Number(item.price) * item.quantity,
      0
    );
    const discountPercent = Number(session.discount_percent || 0);
    const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxRate = hotel ? Number(hotel.tax_rate) || 5 : 5;
    const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
    const total = Math.round((taxableAmount + taxAmount) * 100) / 100;
    const cgst = taxRate / 2;
    const sgst = taxRate / 2;

    // Aggregate items by name and price to save bill space
    const groupedItems = Object.values(
      sessionItems.reduce((acc: any, item: any) => {
        const key = `${item.name}-${item.price}`;
        if (!acc[key]) {
          acc[key] = { ...item };
        } else {
          acc[key].quantity += item.quantity;
        }
        return acc;
      }, {})
    );

    return NextResponse.json({
      session: {
        id: session.id,
        tableNumber: session.table_number,
        startTime: session.start_time,
        subtotal: Number(session.subtotal) || subtotal,
        discountAmount: Number(session.discount_amount) || discountAmount,
        discountPercent,
        taxAmount: Number(session.tax_amount) || taxAmount,
        total: Number(session.total) || total,
        couponCode: session.coupon_code,
        paymentMethod: session.payment_method,
      },
      items: groupedItems.map((item: any) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        quantity: item.quantity,
      })),
      hotel: hotel ? {
        name: hotel.name,
        address: hotel.address,
        gstNumber: hotel.gst_number,
        logo: hotel.logo,
        upiId: hotel.upi_id,
        taxRate,
        cgst,
        sgst,
        printerSize: hotel.customizations?.printerSize || "80mm",
      } : null,
      table: table ? { label: table.label } : null,
    });
  } catch (err: any) {
    console.error("bill-data error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
