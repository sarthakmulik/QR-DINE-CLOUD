import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDineUrl } from "@/lib/utils";
import { getTableSignature } from "@/lib/crypto";
import type { RestaurantTable } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { tableId } = await params;
    const body = await req.json();
    const sb = createAdminClient();

    // Check if the table exists and belongs to the hotel
    const { data: existing } = await sb
      .from("restaurant_tables")
      .select("*")
      .eq("id", tableId)
      .eq("hotel_id", hotelId)
      .maybeSingle<RestaurantTable>();

    if (!existing) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    if (body.tableNumber !== undefined) {
      const tableNumber = parseInt(body.tableNumber);
      if (isNaN(tableNumber) || tableNumber <= 0) {
        return NextResponse.json({ error: "Table number must be a positive integer" }, { status: 400 });
      }

      // Check if another table with this number already exists for this hotel
      const { data: duplicate } = await sb
        .from("restaurant_tables")
        .select("id")
        .eq("hotel_id", hotelId)
        .eq("table_number", tableNumber)
        .neq("id", tableId)
        .maybeSingle();

      if (duplicate) {
        return NextResponse.json({ error: "Table number already exists" }, { status: 400 });
      }

      updates.table_number = tableNumber;

      // Regenerate QR code for the new table number
      const baseDineUrl = getDineUrl(hotelId, tableNumber);
      const signature = getTableSignature(hotelId, tableNumber);
      const dineUrl = `${baseDineUrl}?sign=${signature}`;
      const qrCodeDataUrl = await QRCode.toDataURL(dineUrl, {
        width: 300,
        margin: 2,
      });
      updates.qr_code_url = qrCodeDataUrl;
    }

    if (body.label !== undefined) {
      updates.label = String(body.label || "").trim() || `Table ${body.tableNumber || existing.table_number}`;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error } = await sb
      .from("restaurant_tables")
      .update(updates)
      .eq("id", tableId)
      .select("*")
      .single<RestaurantTable>();

    if (error) throw error;

    return NextResponse.json({
      id: updated.id,
      hotelId: updated.hotel_id,
      tableNumber: updated.table_number,
      label: updated.label,
      qrCodeUrl: updated.qr_code_url,
    });
  } catch (e) {
    console.error("[Edit Table]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update table" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { tableId } = await params;
    const sb = createAdminClient();

    // Verify table exists and belongs to this hotel
    const { data: existing } = await sb
      .from("restaurant_tables")
      .select("id")
      .eq("id", tableId)
      .eq("hotel_id", hotelId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Delete table (this cascade deletes active sessions and session items in Supabase)
    const { error } = await sb
      .from("restaurant_tables")
      .delete()
      .eq("id", tableId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[Delete Table]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete table" },
      { status: 500 }
    );
  }
}
