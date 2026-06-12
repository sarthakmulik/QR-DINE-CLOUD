import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

// Mock implementation of getAppUrl and getDineUrl
function getAppUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}
function getDineUrl(hotelId: string, tableNumber: number): string {
  return `${getAppUrl()}/dine/${hotelId}/${tableNumber}`;
}

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env vars");
    return;
  }
  const sb = createClient(url, key);

  // Use the table ID from our previous output
  const tableId = "8989e640-c105-4af2-ad41-8132b6f66293";
  console.log("Testing regeneration for tableId:", tableId);

  const { data: table, error: fetchError } = await sb
    .from("restaurant_tables")
    .select("*")
    .eq("id", tableId)
    .maybeSingle();

  if (fetchError || !table) {
    console.error("Error fetching table:", fetchError || "Table not found");
    return;
  }

  console.log("Current table number:", table.table_number);
  console.log("Current hotel ID:", table.hotel_id);

  const dineUrl = getDineUrl(table.hotel_id, table.table_number);
  console.log("dineUrl would be:", dineUrl);

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(dineUrl, {
      width: 400,
      margin: 2,
    });
    console.log("Generated QR code length:", qrCodeDataUrl.length);

    const { data: updated, error: updateError } = await sb
      .from("restaurant_tables")
      .update({ qr_code_url: qrCodeDataUrl })
      .eq("id", tableId)
      .select("*")
      .single();

    if (updateError) {
      console.error("Error updating table:", updateError);
    } else {
      console.log("Updated table successfully. New qr_code_url length:", updated.qr_code_url?.length);
    }
  } catch (err) {
    console.error("Error during QRCode generation/db update:", err);
  }
}

run();
