import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDineUrl } from "@/lib/utils";
import type { RestaurantTable } from "@/lib/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { tableId } = await params;
    const sb = createAdminClient();

    const { data: table } = await sb
      .from("restaurant_tables")
      .select("*")
      .eq("id", tableId)
      .eq("hotel_id", hotelId)
      .maybeSingle<RestaurantTable>();

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Generate a fresh QR code using the current APP_URL from env
    const dineUrl = getDineUrl(hotelId, table.table_number);
    const qrCodeDataUrl = await QRCode.toDataURL(dineUrl, {
      width: 400,
      margin: 2,
    });

    const { data: updated, error } = await sb
      .from("restaurant_tables")
      .update({ qr_code_url: qrCodeDataUrl })
      .eq("id", tableId)
      .select("*")
      .single<RestaurantTable>();

    if (error) throw error;

    return NextResponse.json({
      id: updated.id,
      tableNumber: updated.table_number,
      label: updated.label,
      qrCodeUrl: updated.qr_code_url,
      dineUrl, // Return the URL so it's visible in the response
    });
  } catch (e) {
    console.error("[Regenerate QR Error]:", e);
    const msg = e instanceof Error ? e.message : "Failed to regenerate QR";
    if (msg === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
