import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateOpenSession, addItemToSession, recalculateSessionTotals } from "@/lib/session-service";
import type { Hotel, MenuItem } from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import type { SessionItem, TableSession } from "@/lib/types";

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
    const { items } = body as {
      items: { menuItemId: string; quantity: number }[];
    };

    // Section 3: Input validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    for (const item of items) {
      if (!item.menuItemId || typeof item.menuItemId !== "string") {
        return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
      }
      const qty = parseInt(String(item.quantity));
      if (isNaN(qty) || qty < 1 || qty > 99) {
        return NextResponse.json(
          { error: "Quantity must be between 1 and 99" },
          { status: 400 }
        );
      }
    }

    const sb = createAdminClient();

    const { data: hotel } = await sb
      .from("hotels")
      .select("*")
      .eq("id", hotelId)
      .maybeSingle<Hotel>();

    if (!hotel) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    if (hotel.status === "paused" || hotel.status === "suspended") {
      return NextResponse.json(
        { error: "This restaurant is currently not accepting orders." },
        { status: 403 }
      );
    }

    const sessionResult = await getOrCreateOpenSession(hotelId, tableNumber);

    if ("error" in sessionResult) {
      if (sessionResult.error === "checkout") {
        return NextResponse.json(
          { error: "Your bill is being prepared. No new items can be added." },
          { status: 423 }
        );
      }
      return NextResponse.json(
        { error: "This table is currently not accepting orders." },
        { status: 403 }
      );
    }

    const session = sessionResult.session;

    for (const cartItem of items) {
      // Section 4: Always verify menu item price from DB (never trust client)
      const { data: menuItem } = await sb
        .from("menu_items")
        .select("*")
        .eq("id", cartItem.menuItemId)
        .eq("hotel_id", hotelId)
        .eq("is_available", true)
        .maybeSingle<MenuItem>();

      if (!menuItem) {
        // Skip unavailable items silently (they may have just been toggled off)
        continue;
      }

      const qty = Math.max(1, Math.min(99, parseInt(String(cartItem.quantity)) || 1));

      try {
        await addItemToSession(session.id, {
          menuItemId: menuItem.id,
          name: menuItem.name,
          price: Number(menuItem.price), // Always use DB price
          quantity: qty,
        });
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

    // Return fresh session data with recalculated totals
    const { data: updatedItems } = await sb
      .from("session_items")
      .select("*")
      .eq("session_id", session.id)
      .order("added_at", { ascending: true });

    const { data: updatedSession } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", session.id)
      .single<TableSession>();

    if (!updatedSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(
      mapTableSession(updatedSession, (updatedItems || []) as SessionItem[])
    );
  } catch (e) {
    console.error("[Order API] Error:", e);
    return NextResponse.json(
      { error: "Failed to place order. Please try again." },
      { status: 500 }
    );
  }
}
