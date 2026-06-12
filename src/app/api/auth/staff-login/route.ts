import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { cookies } from "next/headers";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const sb = createAdminClient();

    // 1. Fetch staff member by email
    const { data: staff, error } = await sb
      .from("staff")
      .select("*")
      .eq("email", String(email).trim().toLowerCase())
      .maybeSingle();

    if (error || !staff) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // 2. Validate plan of hotel
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan")
      .eq("id", staff.hotel_id)
      .single();

    if (!hotel || hotel.plan.toLowerCase() === "basic") {
      return NextResponse.json({ error: "Staff logins are locked under Basic plan." }, { status: 403 });
    }

    // 3. Verify password hash
    const inputHash = hashPassword(password);
    if (staff.password_hash !== inputHash) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // 4. Set staff session cookie
    const sessionData = {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      hotelId: staff.hotel_id,
      hotelPlan: hotel.plan,
    };

    const cookieStore = await cookies();
    cookieStore.set("staff_session", JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 12, // 12 hours session
      path: "/",
    });

    return NextResponse.json({
      success: true,
      name: staff.name,
      role: staff.role,
      hotelId: staff.hotel_id,
      token: staff.id,
    });
  } catch (err: any) {
    console.error("Staff login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
