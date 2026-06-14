import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapMenuItem } from "@/lib/types";
import type { MenuCategory, MenuItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const { data: categoriesRes, error } = await sb
      .from("menu_categories")
      .select("*, menu_items(*)")
      .eq("hotel_id", hotelId)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const categories = (categoriesRes || []) as (MenuCategory & { menu_items?: MenuItem[] })[];

    const result = categories.map((cat) => {
      // Sort items by name alphabetically since we can't easily order nested joins securely in all PostgREST versions
      const sortedItems = (cat.menu_items || []).sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: cat.id,
        name: cat.name,
        sortOrder: cat.sort_order,
        items: sortedItems.map(mapMenuItem),
      };
    });

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
