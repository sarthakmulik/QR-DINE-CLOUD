export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await params;
    const sb = createAdminClient();

    // Fetch orders that are QS (table_id is null) and status is open or ready_for_pickup
    const { data: sessions, error } = await sb
      .from("table_sessions")
      .select("id, order_number, status, updated_at")
      .eq("hotel_id", hotelId)
      .is("table_id", null)
      .in("status", ["open", "ready_for_pickup"])
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ sessions });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

