import { NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapMenuItem } from "@/lib/types";
import type { MenuCategory, MenuItem } from "@/lib/types";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const [catRes, itemRes] = await Promise.all([
      sb.from("menu_categories").select("*").eq("hotel_id", hotelId).order("sort_order", { ascending: true }),
      sb.from("menu_items").select("*").eq("hotel_id", hotelId).eq("is_available", true)
    ]);

    if (catRes.error) throw catRes.error;
    if (itemRes.error) throw itemRes.error;

    const categories = (catRes.data as MenuCategory[]).map(c => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sort_order
    }));

    const items = (itemRes.data as MenuItem[]).map(mapMenuItem);

    return NextResponse.json({ categories, items });
  } catch (err: any) {
    console.error("Failed to load staff menu:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
