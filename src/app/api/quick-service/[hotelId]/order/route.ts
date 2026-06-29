import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateQuickServiceSession, confirmQuickServiceOrder } from "@/lib/session-service";

// ─── Simple in-process rate limiter for order creation ───────────────────────
// Keyed by "ip:hotelId" → { count, windowStart }
const orderRateMap = new Map<string, { count: number; windowStart: number }>();
const ORDER_RATE_LIMIT = 10;        // max orders per window
const ORDER_RATE_WINDOW = 60_000;   // 1 minute window

function isOrderRateLimited(ip: string, hotelId: string): boolean {
  const key = `${ip}:${hotelId}`;
  const now = Date.now();
  const entry = orderRateMap.get(key);

  if (!entry || now - entry.windowStart > ORDER_RATE_WINDOW) {
    orderRateMap.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  if (entry.count > ORDER_RATE_LIMIT) return true;
  return false;
}

// Clean stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of orderRateMap.entries()) {
      if (now - data.windowStart > ORDER_RATE_WINDOW * 2) {
        orderRateMap.delete(key);
      }
    }
  }, 5 * 60_000);
}
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;

    // ── Rate Limit ────────────────────────────────────────────────────────────
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (isOrderRateLimited(ip, hotelId)) {
      return NextResponse.json(
        { error: "Too many orders. Please wait a moment before trying again." },
        { status: 429 }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const body = await req.json();
    const { items, paymentMethod } = body;

    // ── Basic shape validation ────────────────────────────────────────────────
    if (!Array.isArray(items) || items.length === 0 || !paymentMethod) {
      return NextResponse.json({ error: "Invalid order data" }, { status: 400 });
    }

    if (!["Cash", "UPI", "Card"].includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    // ── Per-item validation (before touching the DB) ──────────────────────────
    for (const item of items) {
      if (!item.menuItemId || typeof item.menuItemId !== "string") {
        return NextResponse.json(
          { error: "Each item must have a valid menuItemId" },
          { status: 400 }
        );
      }
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
        return NextResponse.json(
          { error: "Item quantity must be a whole number between 1 and 20" },
          { status: 400 }
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const sb = createAdminClient();

    // ── Fetch authoritative prices from the DB (price injection prevention) ──
    const menuItemIds: string[] = items.map((i: any) => i.menuItemId);

    const { data: dbItems, error: dbErr } = await sb
      .from("menu_items")
      .select("id, name, price, is_available")
      .in("id", menuItemIds)
      .eq("hotel_id", hotelId)
      .eq("is_available", true);

    if (dbErr || !dbItems) {
      return NextResponse.json({ error: "Failed to validate menu items" }, { status: 500 });
    }

    const dbItemMap = new Map(dbItems.map((i) => [i.id, i]));

    // Make sure every requested item exists, is available, and belongs to this hotel
    for (const item of items) {
      if (!dbItemMap.has(item.menuItemId)) {
        return NextResponse.json(
          { error: `Item "${item.name || item.menuItemId}" is not available` },
          { status: 400 }
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Create a draft session
    const { session, hotel, error } = await getOrCreateQuickServiceSession(hotelId);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    // 2. Build session items using ONLY server-side prices
    const sessionItems = items.map((item: any) => {
      const dbItem = dbItemMap.get(item.menuItemId)!;
      return {
        session_id: session.id,
        menu_item_id: item.menuItemId,
        name: dbItem.name,          // use DB name
        price: Number(dbItem.price), // use DB price — never trust client
        quantity: Number(item.quantity),
      };
    });

    const { error: insertErr } = await sb.from("session_items").insert(sessionItems);
    if (insertErr) {
      throw new Error("Failed to insert items");
    }

    // 3. Confirm the order (generates order_number and sets status to payment_pending)
    const finalSession = await confirmQuickServiceOrder(session.id, paymentMethod);

    return NextResponse.json({ session: finalSession });
  } catch (err: any) {
    console.error("Quick service order error:", err);
    return NextResponse.json({ error: err.message || "Failed to process order" }, { status: 500 });
  }
}
