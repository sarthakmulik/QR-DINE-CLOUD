import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSuperAdmin();
    const sb = createAdminClient();

    // Get hotels with their last payment dates
    const { data: hotels, error: hotelsErr } = await sb
      .from("hotels")
      .select("id, last_payment_date");

    if (hotelsErr) throw hotelsErr;

    // We'll fetch logs based on each hotel's last_payment_date
    // Since Supabase JS doesn't support complex JOINs with dynamic GTE easily in one go, 
    // we fetch the logs individually or fetch all recent logs and filter in memory.
    // Fetching all logs in the last 60 days is usually safe and we can filter.
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

    const { data: logs, error } = await sb
      .from("whatsapp_logs")
      .select("hotel_id, provider_type, created_at")
      .eq("status", "sent")
      .gte("created_at", twoMonthsAgo.toISOString());

    if (error) throw error;

    // Create a map of hotel last payment dates
    const paymentDates: Record<string, string> = {};
    if (hotels) {
      for (const h of hotels) {
        // Fallback to start of current month if no payment date exists
        if (h.last_payment_date) {
          paymentDates[h.id] = h.last_payment_date;
        } else {
          const now = new Date();
          paymentDates[h.id] = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        }
      }
    }

    // Aggregate counts: { hotelId: { platform: X, custom: Y } }
    const usage: Record<string, { platform: number; custom: number }> = {};
    
    if (logs) {
      for (const log of logs) {
        const hotelPaymentDate = paymentDates[log.hotel_id] || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        
        // Only count logs created AFTER their last payment date
        if (new Date(log.created_at) >= new Date(hotelPaymentDate)) {
          if (!usage[log.hotel_id]) {
            usage[log.hotel_id] = { platform: 0, custom: 0 };
          }
          if (log.provider_type === "platform") {
            usage[log.hotel_id].platform++;
          } else if (log.provider_type === "custom") {
            usage[log.hotel_id].custom++;
          }
        }
      }
    }

    return NextResponse.json(usage);
  } catch (err: any) {
    console.error("Failed to fetch WhatsApp usage:", err);
    return NextResponse.json({ error: "Unauthorized or Database Error" }, { status: 401 });
  }
}
