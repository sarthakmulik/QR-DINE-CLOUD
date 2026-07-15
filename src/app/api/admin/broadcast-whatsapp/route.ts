import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsappMessage } from "@/lib/whatsapp-service";

export async function POST(req: Request) {
  try {
    await requireSuperAdmin();
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const sb = createAdminClient();

    const { data: hotels, error } = await sb
      .from("hotels")
      .select("id, name, ownerPhone")
      .eq("status", "active");

    if (error) throw error;

    let sentCount = 0;
    let failCount = 0;

    for (const hotel of hotels || []) {
      if (!hotel.ownerPhone) {
        failCount++;
        continue;
      }
      
      const formattedMessage = `📢 *QR Dine Cloud Broadcast*\n\nHi ${hotel.name},\n${message}`;
      const success = await sendWhatsappMessage(hotel.ownerPhone, formattedMessage, hotel.id);
      
      if (success) sentCount++;
      else failCount++;
    }

    return NextResponse.json({ success: true, sentCount, failCount });
  } catch (err: any) {
    console.error("Broadcast Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
