import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { mapHotel } from "@/lib/types";
import type { Hotel, HotelStatus } from "@/lib/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSuperAdmin();
    const { id } = await params;
    const body = await req.json();

    if (!body.status) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    const { data: hotel, error } = await createAdminClient()
      .from("hotels")
      .update({ status: body.status as HotelStatus })
      .eq("id", id)
      .select("*")
      .single<Hotel>();

    if (error) throw error;

    await logAudit({
      hotelId: id,
      userId: user.id,
      action: "UPDATE_HOTEL_STATUS",
      entityType: "hotel",
      entityId: id,
      details: { status: body.status },
    });

    return NextResponse.json(mapHotel(hotel));
  } catch (err: any) {
    const isAuth = err.message === "Unauthorized";
    return NextResponse.json(
      { error: err.message || "Server Error" },
      { status: isAuth ? 401 : 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSuperAdmin();
    const { id } = await params;
    const sb = createAdminClient();

    const { data: profiles } = await sb
      .from("profiles")
      .select("id")
      .eq("hotel_id", id);

    if (profiles) {
      for (const p of profiles) {
        await sb.auth.admin.deleteUser(p.id);
      }
    }

    const { error } = await sb.from("hotels").delete().eq("id", id);
    if (error) throw error;

    await logAudit({
      hotelId: null, // Hotel is deleted, log globally
      userId: user.id,
      action: "DELETE_HOTEL",
      entityType: "hotel",
      entityId: id,
      details: { hotelId: id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
