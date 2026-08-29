import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { markAsPaid } from "@/lib/session-service";
import type { TableSession } from "@/lib/types";
import { revalidateTag } from "next/cache";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await params;
    const body = await req.json();

    // [H-7 FIX] Validate payment method to prevent arbitrary strings from being stored in DB
    const VALID_PAYMENT_METHODS = ["Cash", "UPI", "Card"];
    if (!VALID_PAYMENT_METHODS.includes(body.paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method. Must be Cash, UPI, or Card." }, { status: 400 });
    }

    const { data: session } = await createAdminClient()
      .from("table_sessions")
      .select("*")
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .maybeSingle<TableSession>();

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await markAsPaid(id, body.paymentMethod, session, body.customerPhone);

    revalidateTag(`staff-overview-${hotelId}`);
    revalidateTag(`kitchen-orders-${hotelId}`);

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    // ALREADY_CLOSED = idempotent — session was already paid. Return 409 so the
    // offline sync queue discards the action without retrying.
    if (message === "ALREADY_CLOSED") {
      return NextResponse.json({ error: "Session already closed" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
