import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidateTag } from "next/cache";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ itemId: string }> }
) {
  try {
    const { hotelId, user } = await requireHotelAccess();
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

    const updatePayload: any = { status: "served" };
    if (user.role === "staff") {
      updatePayload.served_by = user.id;
    }

    // Update status to served
    const { error: updateError } = await sb
      .from("session_items")
      .update(updatePayload)
      .eq("id", itemId);

    if (updateError) throw updateError;

    // We do not transition the session status here.
    // Dine-in sessions remain 'open' until the waiter or customer explicitly initiates checkout.

    revalidateTag(`staff-overview-${hotelId}`);
    revalidateTag(`kitchen-orders-${hotelId}`);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error marking item served:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
