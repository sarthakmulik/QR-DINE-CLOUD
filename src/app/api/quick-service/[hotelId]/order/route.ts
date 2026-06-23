import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateQuickServiceSession, addItemToSession, confirmQuickServiceOrder } from "@/lib/session-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;
    const body = await req.json();
    const { items, paymentMethod } = body;

    if (!items || !items.length || !paymentMethod) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 400 });
    }

    const sb = createAdminClient();

    // 1. Create a draft session
    const { session, hotel, error } = await getOrCreateQuickServiceSession(hotelId);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    // 2. Add all items to the draft session
    // We should do this optimally, but addItemToSession works one by one and recalculates.
    // For a single atomic transaction, we could insert all items directly.
    // Let's use direct insert for speed, then recalculate.
    const sessionItems = items.map((item: any) => ({
      session_id: session.id,
      menu_item_id: item.menuItemId || null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));

    const { error: insertErr } = await sb.from("session_items").insert(sessionItems);
    if (insertErr) {
      throw new Error("Failed to insert items");
    }

    // 3. Confirm the order (generates order_number and sets status to 'open')
    const finalSession = await confirmQuickServiceOrder(session.id, paymentMethod);

    return NextResponse.json({ session: finalSession });
  } catch (err: any) {
    console.error("Quick service order error:", err);
    return NextResponse.json({ error: err.message || "Failed to process order" }, { status: 500 });
  }
}
