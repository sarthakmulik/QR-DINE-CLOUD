import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapHotel, mapMenuItem } from "@/lib/types";
import type { Hotel, MenuCategory, MenuItem } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  const { hotelId } = await params;
  const sb = createAdminClient();

  const [hotelRes, categoriesRes, itemsRes] = await Promise.all([
    sb.from("hotels").select("*").eq("id", hotelId).maybeSingle<Hotel>(),
    sb.from("menu_categories").select("*").eq("hotel_id", hotelId).order("sort_order", { ascending: true }),
    sb.from("menu_items").select("*").eq("hotel_id", hotelId).eq("is_available", true).order("name", { ascending: true }),
  ]);

  const hotel = hotelRes.data as Hotel | null;
  if (!hotel || hotel.service_type !== "quick_service") {
    return NextResponse.json({ error: "Quick Service Restaurant not found" }, { status: 404 });
  }

  if (hotel.status === "paused" || hotel.status === "suspended") {
    return NextResponse.json({ error: "paused", hotel: mapHotel(hotel) }, { status: 403 });
  }

  // Cryptographic Anti-Tampering Check
  if (hotel.secure_qr) {
    const { searchParams } = new URL(_req.url);
    const token = searchParams.get("t");
    // If token is missing or doesn't match the hotel's token, reject.
    if (!token || token !== hotel.quick_service_token) {
      return NextResponse.json({ error: "invalid_qr" }, { status: 403 });
    }
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

  // For Quick Service, we don't return an active session here.
  // The client will create a draft session when needed, or manage cart locally.
  return NextResponse.json({ hotel: mapHotel(hotel), categories: categoriesWithItems });
}
