import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsappMessage } from "@/lib/whatsapp-service";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createAdminClient();

    // 1. Fetch platform settings for whatsapp rate
    const { data: settings } = await sb
      .from("platform_settings")
      .select("whatsapp_rate")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    const rate = settings?.whatsapp_rate || 0;

    // 2. Fetch all active hotels
    const { data: hotels, error } = await sb
      .from("hotels")
      .select("id, name, status, ownerPhone, billingAmount, last_payment_date, nextDueDate")
      .in("status", ["active", "suspended"]); // We might want to remind suspended users too

    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sentCount = 0;
    let suspendedCount = 0;

    for (const hotel of hotels || []) {
      if (!hotel.nextDueDate || !hotel.ownerPhone) continue;

      const dueDate = new Date(hotel.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);

      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Calculate total due
      let waCost = 0;
      if (rate > 0) {
        const paymentDate = hotel.last_payment_date 
          ? new Date(hotel.last_payment_date) 
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        
        const { count } = await sb
          .from("whatsapp_logs")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotel.id)
          .eq("provider_type", "platform")
          .gte("created_at", paymentDate.toISOString());
          
        waCost = (count || 0) * rate;
      }

      const totalDue = (hotel.billingAmount || 0) + waCost;

      // Suspended logic
      if (diffDays <= -2 && hotel.status === "active") {
        // Auto-suspend
        await sb.from("hotels").update({ status: "suspended" }).eq("id", hotel.id);
        const msg = `🚨 *Account Suspended*\n\nHi ${hotel.name},\nYour QR Dine Cloud account has been suspended due to non-payment of ${formatINR(totalDue)}.\n\nPlease clear your dues immediately to restore access.`;
        await sendWhatsappMessage(hotel.ownerPhone, msg, hotel.id);
        suspendedCount++;
        continue;
      }

      // Reminders for 3, 2, 1 days before, and On the Day (0), and 1 day late (-1)
      if ([3, 2, 1, 0, -1].includes(diffDays) && hotel.status === "active") {
        let timingText = "";
        if (diffDays > 0) timingText = `is due in ${diffDays} day(s)`;
        else if (diffDays === 0) timingText = `is due *TODAY*`;
        else timingText = `is *OVERDUE* by 1 day`;

        const msg = `🔔 *Billing Reminder*\n\nHi ${hotel.name},\nYour QR Dine Cloud subscription ${timingText}.\n\n*Total Due:* ${formatINR(totalDue)}\n(Base: ${formatINR(hotel.billingAmount || 0)} + WA: ${formatINR(waCost)})\n\nPlease ensure payment via UPI to avoid account suspension.\nThank you!`;
        await sendWhatsappMessage(hotel.ownerPhone, msg, hotel.id);
        sentCount++;
      }
    }

    return NextResponse.json({ success: true, sentCount, suspendedCount });
  } catch (err: any) {
    console.error("Cron Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
