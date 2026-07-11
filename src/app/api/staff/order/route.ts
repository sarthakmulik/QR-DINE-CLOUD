import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateSessionTotals } from "@/lib/session-service";
import { revalidateTag } from "next/cache";

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

    // Fetch authoritative prices from database
    const menuItemIds = items.map((i: any) => i.menuItemId);
    const { data: dbItems } = await sb
      .from("menu_items")
      .select("id, name, price")
      .in("id", menuItemIds)
      .eq("hotel_id", hotelId);

    const itemMap = new Map((dbItems || []).map((i) => [i.id, i]));

    const insertData = [];
    for (const item of items) {
      const dbItem = itemMap.get(item.menuItemId);
      if (!dbItem) continue;

      insertData.push({
        session_id: sessionId,
        menu_item_id: item.menuItemId,
        name: dbItem.name,
        price: dbItem.price,
        quantity: Math.max(1, parseInt(item.quantity) || 1),
        status: "preparing",
      });
    }

    if (insertData.length === 0) {
      return NextResponse.json({ error: "No valid items found" }, { status: 400 });
    }

    const { error: insertErr } = await sb.from("session_items").insert(insertData);
    if (insertErr) {
      throw insertErr;
    }

    // Reset status to open if it was payment_pending
    if (session.status === "payment_pending") {
      await sb.from("table_sessions").update({ status: "open" }).eq("id", sessionId);
    }

    // Recalculate session totals using central service
    await recalculateSessionTotals(sessionId);

    revalidateTag(`staff-overview-${hotelId}`);
    revalidateTag(`kitchen-orders-${hotelId}`);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error adding items to order via staff:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
