import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateOpenSession, addItemToSession } from "@/lib/session-service";
import type { Hotel, MenuItem, SessionItem, TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import { verifyTableSignature } from "@/lib/crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; tableNumber: string }> }
) {
  try {
    const { hotelId, tableNumber: tableNumStr } = await params;
    const tableNumber = parseInt(tableNumStr);

    if (isNaN(tableNumber) || tableNumber < 1) {
      return NextResponse.json({ error: "Invalid table number" }, { status: 400 });
    }

    const body = await req.json();
    const { items } = body as { items: { menuItemId: string; quantity: number }[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    // Validate quantities
    const menuItemIds: string[] = [];
    for (const item of items) {
      if (!item.menuItemId || typeof item.menuItemId !== "string") {
        return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
      }
      const qty = parseInt(String(item.quantity));
      if (isNaN(qty) || qty < 1 || qty > 99) {
        return NextResponse.json({ error: "Quantity must be between 1 and 99" }, { status: 400 });
      }
      menuItemIds.push(item.menuItemId);
    }

    const sb = createAdminClient();

    // Batch-fetch all menu items + hotel status in PARALLEL (not serial per item)
    const [menuItemsRes, hotelRes] = await Promise.all([
      sb.from("menu_items")
        .select("id, name, price, is_available")
        .in("id", menuItemIds)
        .eq("hotel_id", hotelId)
        .eq("is_available", true),
      sb.from("hotels").select("status, plan, secure_qr").eq("id", hotelId).maybeSingle(),
    ]);

    const { searchParams } = new URL(req.url);
    const signature = searchParams.get("sign");

    const hotel = hotelRes.data;
    if (!hotel) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    if (hotel.secure_qr && !verifyTableSignature(hotelId, tableNumber, signature)) {
      return NextResponse.json({ error: "invalid_qr" }, { status: 403 });
    }

    if (hotel.status === "paused" || hotel.status === "suspended") {
      return NextResponse.json({ error: "This restaurant is currently not accepting orders." }, { status: 403 });
    }

    // Build a lookup map for O(1) price lookup
    const menuItemMap = new Map<string, { id: string; name: string; price: number }>((menuItemsRes.data || []).map((m: any) => [m.id, m]));

    // Get or create session
    const sessionResult = await getOrCreateOpenSession(hotelId, tableNumber);

    if ("error" in sessionResult) {
      if (sessionResult.error === "checkout") {
        return NextResponse.json(
          { error: "Your bill is being prepared. No new items can be added.", session: sessionResult.session, hotel: sessionResult.hotel },
          { status: 423 }
        );
      }
      return NextResponse.json({ error: "This table is currently not accepting orders." }, { status: 403 });
    }

    const session = sessionResult.session;
    const hotelData = sessionResult.hotel;

    // Add items sequentially (each recalculates totals — can't parallelise as each depends on previous)
    let lastResult = null;
    for (const cartItem of items) {
      const menuItem = menuItemMap.get(cartItem.menuItemId);
      if (!menuItem) continue; // Skip unavailable items

      const qty = Math.max(1, Math.min(99, parseInt(String(cartItem.quantity)) || 1));
      try {
        lastResult = await addItemToSession(
          session.id,
          { menuItemId: menuItem.id, name: menuItem.name, price: Number(menuItem.price), quantity: qty },
          session as any
        );
      } catch (addErr) {
        if (addErr instanceof Error && addErr.message === "SESSION_NOT_OPEN") {
          return NextResponse.json(
            { error: "Your session has closed. Please scan the QR code again." },
            { status: 423 }
          );
        }
        throw addErr;
      }
    }

    // Return the last recalculated session directly — no extra DB fetch
    if (lastResult) {
      return NextResponse.json(lastResult);
    }

    // Fallback: all items were unavailable
    return NextResponse.json({ error: "All selected items are currently unavailable." }, { status: 400 });
  } catch (e) {
    console.error("[Order API] Error:", e);
    return NextResponse.json({ error: "Failed to place order. Please try again." }, { status: 500 });
  }
}
