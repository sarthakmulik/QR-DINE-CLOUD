import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapHotel, mapMenuItem, mapTableSession } from "@/lib/types";
import type { Hotel, MenuCategory, MenuItem, RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import { verifyTableSignature } from "@/lib/crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; tableNumber: string }> }
) {
  const { hotelId, tableNumber: tableNumStr } = await params;
  const tableNumber = parseInt(tableNumStr);

  if (isNaN(tableNumber)) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  const { searchParams } = new URL(_req.url);
  const sessionOnly = searchParams.get("sessionOnly") === "true";
  const signature = searchParams.get("sign");

  const sb = createAdminClient();

  // Parallel: hotel + table + (if !sessionOnly) menu in one batch
  const baseQueries = [
    sb.from("hotels").select("*").eq("id", hotelId).maybeSingle<Hotel>(),
    sb.from("restaurant_tables").select("*").eq("hotel_id", hotelId).eq("table_number", tableNumber).maybeSingle<RestaurantTable>(),
  ] as const;

  if (!sessionOnly) {
    const [hotelRes, tableRes, categoriesRes, itemsRes] = await Promise.all([
      ...baseQueries,
      sb.from("menu_categories").select("*").eq("hotel_id", hotelId).order("sort_order", { ascending: true }),
      sb.from("menu_items").select("*").eq("hotel_id", hotelId).eq("is_available", true).order("name", { ascending: true }),
    ]);

    const hotel = hotelRes.data as Hotel | null;
    if (!hotel) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

    // Cryptographic Anti-Tampering Check
    if (hotel.secure_qr && !verifyTableSignature(hotelId, tableNumber, signature)) {
      return NextResponse.json({ error: "invalid_qr" }, { status: 403 });
    }

    if (hotel.status === "paused" || hotel.status === "suspended") {
      return NextResponse.json({ error: "paused", hotel: mapHotel(hotel) }, { status: 403 });
    }

    const categories = (categoriesRes.data || []) as MenuCategory[];
    const items = (itemsRes.data || []) as MenuItem[];
    const itemsByCategoryId: Record<string, MenuItem[]> = {};
    for (const item of items) {
      if (!itemsByCategoryId[item.category_id]) itemsByCategoryId[item.category_id] = [];
      itemsByCategoryId[item.category_id].push(item);
    }
    const categoriesWithItems = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      items: (itemsByCategoryId[cat.id] || []).map(mapMenuItem),
    }));

    let table = tableRes.data as RestaurantTable | null;
    if (!table) {
      const { data: created, error } = await sb
        .from("restaurant_tables")
        .insert({ hotel_id: hotelId, table_number: tableNumber, label: `Table ${tableNumber}` })
        .select("*").single<RestaurantTable>();
      if (error || !created) return NextResponse.json({ error: "Failed to create table" }, { status: 500 });
      table = created;
    }

    let activeSession = null;
    if (table.current_session_id) {
      const { data: sessionWithItems } = await sb
        .from("table_sessions").select("*, session_items(*)")
        .eq("id", table.current_session_id).maybeSingle();
      if (sessionWithItems && sessionWithItems.status !== "closed") {
        activeSession = mapTableSession(sessionWithItems as TableSession, (sessionWithItems.session_items || []) as SessionItem[]);
      }
    }

    if (activeSession) {
      if (activeSession.status === "checkout_initiated" || activeSession.status === "bill_printed") {
        return NextResponse.json({ error: "checkout", hotel: mapHotel(hotel), session: activeSession, categories: categoriesWithItems });
      }
      return NextResponse.json({ hotel: mapHotel(hotel), session: activeSession, categories: categoriesWithItems });
    }
    return NextResponse.json({ hotel: mapHotel(hotel), session: null, categories: categoriesWithItems });
  }

  // sessionOnly path — just hotel + table
  const [hotelRes, tableRes] = await Promise.all(baseQueries);
  const hotel = hotelRes.data as Hotel | null;
  if (!hotel) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  // Cryptographic Anti-Tampering Check
  if (hotel.secure_qr && !verifyTableSignature(hotelId, tableNumber, signature)) {
    return NextResponse.json({ error: "invalid_qr" }, { status: 403 });
  }

  if (hotel.status === "paused" || hotel.status === "suspended") {
    return NextResponse.json({ error: "paused", hotel: mapHotel(hotel) }, { status: 403 });
  }

  let table = tableRes.data as RestaurantTable | null;
  if (!table) {
    return NextResponse.json({ hotel: mapHotel(hotel), session: null, categories: [] });
  }

  let activeSession = null;
  if (table.current_session_id) {
    const { data: sessionWithItems } = await sb
      .from("table_sessions").select("*, session_items(*)")
      .eq("id", table.current_session_id).maybeSingle();
    if (sessionWithItems && sessionWithItems.status !== "closed") {
      activeSession = mapTableSession(sessionWithItems as TableSession, (sessionWithItems.session_items || []) as SessionItem[]);
    }
  }

  if (activeSession) {
    if (activeSession.status === "checkout_initiated" || activeSession.status === "bill_printed") {
      return NextResponse.json({ error: "checkout", hotel: mapHotel(hotel), session: activeSession, categories: [] });
    }
    return NextResponse.json({ hotel: mapHotel(hotel), session: activeSession, categories: [] });
  }
  return NextResponse.json({ hotel: mapHotel(hotel), session: null, categories: [] });
}
