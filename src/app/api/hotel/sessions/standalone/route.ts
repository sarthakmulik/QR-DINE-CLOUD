import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createStandaloneSession } from "@/lib/session-service";

export async function POST(req: NextRequest) {
  try {
    const { hotelId } = await requireHotelAccess();
    const body = await req.json();
    const orderType = body.orderType || "takeaway";

    const result = await createStandaloneSession(hotelId, orderType);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.session);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create session" },
      { status: 500 }
    );
  }
}
