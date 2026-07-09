import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateOpenSession, addItemToSession } from "@/lib/session-service";
import type { Hotel, MenuItem, SessionItem, TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import { verifyTableSignature } from "@/lib/crypto";
import { sendStaffPush, sendStaffPushSequential } from "@/lib/push";
import crypto from "crypto";
import { revalidateTag } from "next/cache";

const lastOrderHash = new Map<string, { hash: string; timestamp: number }>();

// Clean up old order fingerprints to avoid memory leaks
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of lastOrderHash.entries()) {
      if (now - value.timestamp > 60000) {
        lastOrderHash.delete(key);
      }
    }
  }, 60000);
}

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
    const { items, sessionId: expectedSessionId } = body as { items: { menuItemId: string; quantity: number }[], sessionId?: string };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    // Limit array payload bounds (NoSQL/SQL injection payload stress prevention)
    if (items.length > 50) {
      return NextResponse.json({ error: "Too many distinct items in a single order (max 50)" }, { status: 400 });
    }

    // Validate quantities and ID formats
    const menuItemIds: string[] = [];
    for (const item of items) {
      if (!item.menuItemId || typeof item.menuItemId !== "string") {
        return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
      }
      if (item.menuItemId.length > 50) {
        return NextResponse.json({ error: "Invalid item ID format" }, { status: 400 });
      }
      const qty = parseInt(String(item.quantity));
      if (isNaN(qty) || qty < 1 || qty > 99) {
        return NextResponse.json({ error: "Quantity must be between 1 and 99" }, { status: 400 });
      }
      menuItemIds.push(item.menuItemId);
    }

    // Fingerprint hashing to prevent client order replay spam within 5 seconds
    const payloadString = JSON.stringify(
      items
        .map((i) => ({ id: i.menuItemId, q: i.quantity }))
        .sort((a, b) => a.id.localeCompare(b.id))
    );
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${hotelId}:${tableNumber}:${payloadString}`)
      .digest("hex");

    const tableKey = `${hotelId}:${tableNumber}`;
    const lastOrder = lastOrderHash.get(tableKey);
    if (lastOrder && lastOrder.hash === fingerprint && Date.now() - lastOrder.timestamp < 5000) {
      return NextResponse.json(
        { error: "Duplicate order submission blocked. Please wait a few seconds." },
        { status: 409 }
      );
    }
    lastOrderHash.set(tableKey, { hash: fingerprint, timestamp: Date.now() });

    const sb = createAdminClient();

    // Batch-fetch all menu items + hotel status in PARALLEL (not serial per item)
    const [menuItemsRes, hotelRes] = await Promise.all([
      sb.from("menu_items")
        .select("id, name, price, is_available, menu_categories(name)")
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
    const menuItemMap = new Map<string, { id: string; name: string; price: number; category_name?: string }>(
      (menuItemsRes.data || []).map((m: any) => [
        m.id, 
        { ...m, category_name: m.menu_categories?.name }
      ])
    );

    // Get or create session
    const sessionResult = await getOrCreateOpenSession(hotelId, tableNumber, expectedSessionId);

    if ("error" in sessionResult) {
      if (sessionResult.error === "session_closed") {
        return NextResponse.json(
          { error: "session_closed", message: "Your session has closed. Please scan the QR code again." },
          { status: 403 }
        );
      }
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
    let hasDrinks = false;
    const orderedDrinks: string[] = [];

    for (const cartItem of items) {
      const menuItem = menuItemMap.get(cartItem.menuItemId);
      if (!menuItem) continue; // Skip unavailable items

      const qty = Math.max(1, Math.min(99, parseInt(String(cartItem.quantity)) || 1));

      if (menuItem.category_name) {
        const cat = menuItem.category_name.toLowerCase();
        if (cat.includes("drink") || cat.includes("beverage")) {
          hasDrinks = true;
          orderedDrinks.push(`${qty}x ${menuItem.name}`);
        }
      }

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

    if (lastResult) {
      // Background: If any drinks were ordered, send a direct push to one waiter in a round-robin
      if (hasDrinks) {
        const drinkListString = orderedDrinks.join(", ");
        // MUST await this so serverless environments don't kill the Firebase JWT handshake!
        await sendStaffPushSequential(hotelId, {
          title: "New Drink Order 🥤",
          body: `Table ${tableNumber} ordered: ${drinkListString}`,
          tag: `drink-${session.id}`,
          url: `/staff/${hotelId}?tab=orders`
        });
      }

      revalidateTag(`staff-overview-${hotelId}`);
      revalidateTag(`kitchen-orders-${hotelId}`);

      return NextResponse.json(lastResult);
    }

    // Fallback: all items were unavailable
    return NextResponse.json({ error: "All selected items are currently unavailable." }, { status: 400 });
  } catch (e) {
    console.error("[Order API] Error:", e);
    return NextResponse.json({ error: "Failed to place order. Please try again." }, { status: 500 });
  }
}
