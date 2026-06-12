import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateSessionTotals } from "@/lib/session-service";
import { verifyTableSignature } from "@/lib/crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string; tableNumber: string }> }
) {
  try {
    const { hotelId, tableNumber: tableNumStr } = await params;
    const tableNumber = parseInt(tableNumStr);
    const body = await req.json();
    const { code } = body;

    if (isNaN(tableNumber)) {
      return NextResponse.json({ error: "Invalid table" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const signature = searchParams.get("sign");

    const sb = createAdminClient();

    // Fetch table + hotel in parallel
    const [tableRes, hotelRes] = await Promise.all([
      sb.from("restaurant_tables").select("current_session_id").eq("hotel_id", hotelId).eq("table_number", tableNumber).maybeSingle(),
      sb.from("hotels").select("plan, secure_qr").eq("id", hotelId).maybeSingle(),
    ]);

    const hotel = hotelRes.data;
    if (!hotel) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    if (hotel.secure_qr && !verifyTableSignature(hotelId, tableNumber, signature)) {
      return NextResponse.json({ error: "invalid_qr" }, { status: 403 });
    }

    const table = tableRes.data;
    if (!table || !table.current_session_id) {
      return NextResponse.json({ error: "No active session on this table" }, { status: 400 });
    }

    const sessionId = table.current_session_id;

    if (code) {
      const [sessionRes, couponRes] = await Promise.all([
        sb.from("table_sessions").select("*").eq("id", sessionId).maybeSingle(),
        sb.from("coupons").select("*").eq("hotel_id", hotelId).eq("code", String(code).trim().toUpperCase()).eq("is_active", true).maybeSingle(),
      ]);

      const session = sessionRes.data;
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      if (session.status === "closed") return NextResponse.json({ error: "Session is already closed" }, { status: 400 });

      if (hotel.plan.toLowerCase() === "basic") {
        return NextResponse.json({ error: "Coupons are not enabled on this plan." }, { status: 403 });
      }

      const coupon = couponRes.data;
      if (!coupon) return NextResponse.json({ error: "Invalid or inactive coupon code." }, { status: 400 });

      if (Number(session.subtotal) < Number(coupon.min_bill)) {
        return NextResponse.json(
          { error: `Coupon requires a minimum order value of ₹${coupon.min_bill}.` },
          { status: 400 }
        );
      }

      const { error: updateErr } = await sb
        .from("table_sessions")
        .update({ coupon_code: coupon.code, discount_percent: Number(coupon.discount_percent) })
        .eq("id", sessionId);

      if (updateErr) throw updateErr;

      const updated = await recalculateSessionTotals(sessionId);
      return NextResponse.json(updated);
    } else {
      // Removing coupon — just need session
      const { data: session } = await sb.from("table_sessions").select("status").eq("id", sessionId).maybeSingle();
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      if (session.status === "closed") return NextResponse.json({ error: "Session is already closed" }, { status: 400 });

      const { error: updateErr } = await sb
        .from("table_sessions")
        .update({ coupon_code: null, discount_percent: 0 })
        .eq("id", sessionId);

      if (updateErr) throw updateErr;

      const updated = await recalculateSessionTotals(sessionId);
      return NextResponse.json(updated);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to apply coupon" },
      { status: 500 }
    );
  }
}
