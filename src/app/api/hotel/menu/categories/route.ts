import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapMenuItem } from "@/lib/types";
import type { MenuCategory, MenuItem } from "@/lib/types";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const [categoriesRes, itemsRes] = await Promise.all([
      sb
        .from("menu_categories")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true }),
      sb
        .from("menu_items")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("name", { ascending: true }),
    ]);

    const categories = (categoriesRes.data || []) as MenuCategory[];
    const items = (itemsRes.data || []) as MenuItem[];

    const itemsByCategoryId: Record<string, MenuItem[]> = {};
    for (const item of items) {
      if (!itemsByCategoryId[item.category_id]) {
        itemsByCategoryId[item.category_id] = [];
      }
      itemsByCategoryId[item.category_id].push(item);
    }

    const result = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sort_order,
      items: (itemsByCategoryId[cat.id] || []).map(mapMenuItem),
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const body = await req.json();

    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    const sb = createAdminClient();

    // Check if category name already exists (case-insensitive) for this hotel
    const { data: existingCats } = await sb
      .from("menu_categories")
      .select("name")
      .eq("hotel_id", hotelId);

    const hasDuplicate = existingCats?.some(
      (cat) => cat.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (hasDuplicate) {
      return NextResponse.json(
        { error: "A category with this name already exists" },
        { status: 400 }
      );
    }

    const { data: category, error } = await sb
      .from("menu_categories")
      .insert({
        hotel_id: hotelId,
        name: name,
        sort_order: body.sortOrder ?? 0,
      })
      .select("*")
      .single<MenuCategory>();

    if (error) throw error;

    return NextResponse.json({
      id: category!.id,
      name: category!.name,
      sortOrder: category!.sort_order,
    });
  } catch (e) {
    if (e instanceof Error && e.message !== "Unauthorized") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
