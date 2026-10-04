import { NextRequest, NextResponse } from "next/server";
import { getTableSignature } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const VIRTUAL_BASE = 900000;
// table_number is a 32-bit integer; keep a huge random space so two customers
// can never collide on the same virtual table (and therefore share a cart).
const VIRTUAL_SPAN = 2_000_000_000;

function newVirtualTableNumber() {
  return VIRTUAL_BASE + Math.floor(Math.random() * VIRTUAL_SPAN);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  const { hotelId } = await params;

  const cookieStore = await cookies();
  const cookieName = `takeaway_table_${hotelId}`;
  const existing = parseInt(cookieStore.get(cookieName)?.value || "", 10);

  let virtualTableNumber = newVirtualTableNumber();

  // Reuse the customer's previous virtual table ONLY while their order is still
  // live. Once it is collected/paid/cancelled they get a brand-new table, so the
  // client-side "session closed" cooldown can never lock them out of re-ordering.
  if (!isNaN(existing) && existing >= VIRTUAL_BASE) {
    try {
      const sb = createAdminClient();
      const { data: latest } = await sb
        .from("table_sessions")
        .select("status")
        .eq("hotel_id", hotelId)
        .eq("table_number", existing)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      // No order yet (keep their unsent cart) or order still live => resume.
      if (!latest || (latest.status !== "closed" && latest.status !== "cancelled")) {
        virtualTableNumber = existing;
      }
    } catch {
      // On DB hiccup fall back to a fresh table rather than failing the scan.
    }
  }

  const signature = getTableSignature(hotelId, virtualTableNumber);
  const redirectUrl = new URL(`/dine/${hotelId}/${virtualTableNumber}?sign=${signature}`, req.url);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set(cookieName, virtualTableNumber.toString(), {
    path: "/",
    maxAge: 60 * 60 * 6, // 6 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
}
