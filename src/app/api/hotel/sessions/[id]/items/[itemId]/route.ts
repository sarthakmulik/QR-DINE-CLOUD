import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { removeItemFromSession } from "@/lib/session-service";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id, itemId } = await params;

    const updated = await removeItemFromSession(id, itemId, hotelId);

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to remove item" },
      { status: 400 }
    );
  }
}
