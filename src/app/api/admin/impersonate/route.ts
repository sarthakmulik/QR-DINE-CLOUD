import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "superadmin" && !user.isImpersonating) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { hotelId } = await req.json();

    if (!hotelId) {
      return NextResponse.json({ error: "Missing hotelId" }, { status: 400 });
    }

    const cookieStore = await cookies();
    cookieStore.set("impersonate_hotel_id", hotelId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
