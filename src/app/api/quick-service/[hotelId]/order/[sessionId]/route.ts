import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; sessionId: string }> }
) {
  try {
    const { sessionId, hotelId } = await params;
    const sb = createAdminClient();

    const { data: session } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("hotel_id", hotelId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error: any) {
    console.error("Fetch session error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
