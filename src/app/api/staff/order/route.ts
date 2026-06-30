import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const body = await req.json();
    const { sessionId, items } = body as { sessionId: string; items: any[] };

    if (!sessionId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const sb = createAdminClient();

    // Verify session belongs to this hotel and is open
    const { data: session, error: sessionErr } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("hotel_id", hotelId)
      .single();

    if (sessionErr || !session || session.status === "closed") {
      return NextResponse.json({ error: "Active session not found" }, { status: 404 });
    }

    // Insert items
    const insertData = items.map((item) => ({
      session_id: sessionId,
      menu_item_id: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      status: "preparing",
    }));

    const { error: insertErr } = await sb.from("session_items").insert(insertData);
    if (insertErr) {
      throw insertErr;
    }

    // Recalculate session totals
    const { data: allItems } = await sb
      .from("session_items")
      .select("price, quantity")
      .eq("session_id", sessionId);

    if (allItems) {
      const subtotal = allItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);
      
      const { data: hotel } = await sb.from("hotels").select("tax_rate").eq("id", hotelId).single();
      const taxRate = hotel?.tax_rate || 0;
      
      const discountPercent = session.discount_percent || 0;
      const discountAmount = Number(((subtotal * discountPercent) / 100).toFixed(2));
      const postDiscount = subtotal - discountAmount;
      const taxAmount = Number(((postDiscount * taxRate) / 100).toFixed(2));
      const total = Number((postDiscount + taxAmount).toFixed(2));

      await sb
        .from("table_sessions")
        .update({
          subtotal,
          discount_amount: discountAmount,
          tax_amount: taxAmount,
          total,
          status: "open", // Reset status to open if it was payment_pending
        })
        .eq("id", sessionId);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error adding items to order via staff:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
