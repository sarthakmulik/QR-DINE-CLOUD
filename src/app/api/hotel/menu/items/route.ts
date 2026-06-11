import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapMenuItem } from "@/lib/types";
import type { MenuItem } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const body = await req.json();

    // Section 3: Server-side input validation
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: "Item name is required" }, { status: 400 });
    }
    if (!body.categoryId) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }
    const price = parseFloat(body.price);
    if (isNaN(price) || price < 0) {
      return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
    }

    const sb = createAdminClient();

    // Enforce plan limits
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan")
      .eq("id", hotelId)
      .single();

    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    const plan = hotel.plan.toLowerCase();
    const maxItems = plan === "basic" ? 20 : plan === "pro" ? 50 : Infinity;

    if (maxItems !== Infinity) {
      const { count, error: countError } = await sb
        .from("menu_items")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotelId);

      if (countError) throw countError;

      if ((count || 0) >= maxItems) {
        return NextResponse.json(
          { error: `Menu item limit reached. You can only create up to ${maxItems} items on the ${hotel.plan} plan.` },
          { status: 403 }
        );
      }
    }

    const { data: item, error } = await sb
      .from("menu_items")
      .insert({
        hotel_id: hotelId,
        category_id: body.categoryId,
        name: String(body.name).trim(),
        description: body.description || null,
        price,
        image_url: body.imageUrl || null,
        is_available: body.isAvailable ?? true,
      })
      .select("*")
      .single<MenuItem>();

    if (error) throw error;

    return NextResponse.json(mapMenuItem(item!));
  } catch (e) {
    if (e instanceof Error && e.message !== "Unauthorized") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
