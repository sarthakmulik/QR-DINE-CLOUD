import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import QRCode from "qrcode";
import type { Hotel } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    // 1. Generate a new UUID for the quick_service_token
    const { data: updatedHotel, error } = await sb
      .from("hotels")
      .update({ quick_service_token: crypto.randomUUID() })
      .eq("id", hotelId)
      .select("id, quick_service_token")
      .single<Hotel>();

    if (error || !updatedHotel) {
      throw new Error(error?.message || "Failed to update hotel token");
    }

    // 2. Generate the new tokenized URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://qr-dine.com";
    const genericDineUrl = `${appUrl}/dine/${hotelId}?t=${updatedHotel.quick_service_token}`;
    
    // 3. Create a data URL so the client can display/download the QR code
    const qrCodeDataUrl = await QRCode.toDataURL(genericDineUrl, {
      width: 400,
      margin: 2,
    });

    return NextResponse.json({
      qrCodeUrl: qrCodeDataUrl,
      dineUrl: genericDineUrl,
      token: updatedHotel.quick_service_token,
    });
  } catch (e) {
    console.error("[Regenerate Quick Service QR Error]:", e);
    const msg = e instanceof Error ? e.message : "Failed to regenerate QR";
    if (msg === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
