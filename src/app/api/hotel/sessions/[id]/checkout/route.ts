import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { initiateCheckout } from "@/lib/session-service";
import type { TableSession } from "@/lib/types";
import { revalidateTag } from "next/cache";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;

    const { data: session } = await createAdminClient()
      .from("table_sessions")
      .select("*")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle<TableSession>();

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await _req.json().catch(() => ({}));
    const updated = await initiateCheckout(id, session, body.customerPhone);

    revalidateTag(`staff-overview-${hotelId}`);
    revalidateTag(`kitchen-orders-${hotelId}`);

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}
