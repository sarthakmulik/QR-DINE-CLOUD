import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MenuCategory } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const body = await req.json();
    const sb = createAdminClient();

    // Check if the category exists and belongs to the hotel
    const { data: existing } = await sb
      .from("menu_categories")
      .select("*")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) {
        return NextResponse.json({ error: "Category name is required" }, { status: 400 });
      }

      // Check if any OTHER category already has this name (case-insensitive) for this hotel
      const { data: otherCats } = await sb
        .from("menu_categories")
        .select("id, name")
        .eq("hotel_id", hotelId)
        .neq("id", id);

      const hasDuplicate = otherCats?.some(
        (cat) => cat.name.trim().toLowerCase() === name.toLowerCase()
      );

      if (hasDuplicate) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 400 }
        );
      }

      updates.name = name;
    }

    if (body.sortOrder !== undefined) {
      updates.sort_order = Number(body.sortOrder);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: category, error } = await sb
      .from("menu_categories")
      .update(updates)
      .eq("id", id)
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const sb = createAdminClient();

    // Verify category exists and belongs to this hotel
    const { data: existing } = await sb
      .from("menu_categories")
      .select("id")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Delete category (cascade deletes menu items via Postgres trigger/foreign keys)
    const { error } = await sb
      .from("menu_categories")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message !== "Unauthorized") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
