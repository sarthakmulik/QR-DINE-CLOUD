import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ itemId: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { itemId } = await props.params;

    const sb = createAdminClient();

    // Verify item belongs to a session in this hotel
    const { data: item, error: selectError } = await sb
      .from("session_items")
      .select(`id, session_id, table_sessions (hotel_id)`)
      .eq("id", itemId)
      .single();

    if (selectError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const sessionData = item.table_sessions as any;
    if (sessionData?.hotel_id !== hotelId) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    // Update status to served
    const { error: updateError } = await sb
      .from("session_items")
      .update({ status: "served" })
      .eq("id", itemId);

    if (updateError) throw updateError;

    // Check if all items in session are served/ready
    const { data: allItems } = await sb
      .from("session_items")
      .select("status")
      .eq("session_id", item.session_id);

    if (allItems && allItems.length > 0) {
      const allReadyOrServed = allItems.every(i => i.status === "ready" || i.status === "served");
      if (allReadyOrServed) {
        await sb.from("table_sessions").update({ status: "ready_for_pickup" }).eq("id", item.session_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error marking item served:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
