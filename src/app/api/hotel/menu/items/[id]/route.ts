import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapMenuItem } from "@/lib/types";
import type { MenuItem } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const body = await req.json();
    const sb = createAdminClient();

    const { data: existing } = await sb
      .from("menu_items")
      .select("*")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.price !== undefined) {
      const price = parseFloat(body.price);
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
      }
      updates.price = price;
    }
    if (body.imageUrl !== undefined) updates.image_url = body.imageUrl || null;
    if (body.isAvailable !== undefined) updates.is_available = body.isAvailable;
    if (body.categoryId !== undefined) updates.category_id = body.categoryId;


    const { data: item, error } = await sb
      .from("menu_items")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single<MenuItem>();

    if (error) throw error;

    return NextResponse.json(mapMenuItem(item!));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const sb = createAdminClient();

    const { data: existing } = await sb
      .from("menu_items")
      .select("id")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await sb.from("menu_items").delete().eq("id", id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
