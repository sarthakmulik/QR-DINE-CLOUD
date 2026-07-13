import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateUpsellMap } from "@/lib/ai-engine";
import type { SessionItem } from "@/lib/types";

// Cache disabled for testing/development (set back to 3600 in prod)
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelId = searchParams.get("hotelId");

    if (!hotelId) {
      return NextResponse.json({ error: "Missing hotelId" }, { status: 400 });
    }

    const sb = createAdminClient();

    // Fetch the last 30 days of session items for this hotel to calculate AI Upsells
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch sessions
    const { data: sessions, error: sessionsError } = await sb
      .from("table_sessions")
      .select("id")
      .eq("hotel_id", hotelId)
      .eq("status", "closed")
      .gte("closed_at", thirtyDaysAgo);

    if (sessionsError) {
      console.error("Error fetching sessions for upsells:", sessionsError);
      return NextResponse.json({ upsellsMap: {} }); // Fail gracefully so menu still loads
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ upsellsMap: {} });
    }

    const sessionIds = sessions.map(s => s.id);

    // 2. Fetch session items
    let items: SessionItem[] = [];
    const chunkSize = 500;
    
    for (let i = 0; i < sessionIds.length; i += chunkSize) {
      const chunk = sessionIds.slice(i, i + chunkSize);
      const { data: chunkItems, error: itemsError } = await sb
        .from("session_items")
        .select("*")
        .in("session_id", chunk);

      if (!itemsError && chunkItems) {
        items = items.concat(chunkItems as SessionItem[]);
      }
    }

    // 3. Generate Upsell Map using AI Engine
    const upsellsMap = generateUpsellMap(items);

    return NextResponse.json({ upsellsMap });

  } catch (err) {
    console.error("Error in AI upsells API route:", err);
    return NextResponse.json({ upsellsMap: {} }); // Fail gracefully
  }
}
