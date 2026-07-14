import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSuperAdmin();
    const sb = createAdminClient();

    // Get the start of the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Grouping count manually since Supabase js client doesn't natively support group by aggregate perfectly
    // We'll fetch all logs for the month and aggregate in memory (fast enough for billing)
    const { data: logs, error } = await sb
      .from("whatsapp_logs")
      .select("hotel_id, provider_type")
      .eq("status", "sent")
      .gte("created_at", startOfMonth);

    if (error) throw error;

    // Aggregate counts: { hotelId: { platform: X, custom: Y } }
    const usage: Record<string, { platform: number; custom: number }> = {};
    
    if (logs) {
      for (const log of logs) {
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

    return NextResponse.json(usage);
  } catch (err: any) {
    console.error("Failed to fetch WhatsApp usage:", err);
    return NextResponse.json({ error: "Unauthorized or Database Error" }, { status: 401 });
  }
}
