import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { cookies } from "next/headers";
import { checkLoginRateLimit, recordLoginFailure, resetLoginAttempts } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    // Prevent multiple long password DoS attacks (ceiling of 72 characters)
    if (password.length < 4 || password.length > 72) {
      return NextResponse.json({ error: "Password must be between 4 and 72 characters." }, { status: 400 });
    }

    // Rate Limiting / Lockout checks
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "127.0.0.1";
    const ipKey = `ip:${ip}`;
    const emailKey = `email:${String(email).trim().toLowerCase()}`;

    const ipLimit = await checkLoginRateLimit(ipKey);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts from this IP. Please try again in ${Math.ceil(ipLimit.lockTimeLeft / 60)} minutes.` },
        { status: 429 }
      );
    }

    const emailLimit = await checkLoginRateLimit(emailKey);
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: `This account is temporarily locked due to too many failed login attempts. Please try again in ${Math.ceil(emailLimit.lockTimeLeft / 60)} minutes.` },
        { status: 429 }
      );
    }

    const sb = createAdminClient();

    // 1. Fetch staff member by email
    const { data: staff, error } = await sb
      .from("staff")
      .select("*")
      .eq("email", String(email).trim().toLowerCase())
      .maybeSingle();

    if (error || !staff) {
      await recordLoginFailure(ipKey);
      await recordLoginFailure(emailKey);
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
    let isValid = false;
    let needsUpgrade = false;

    if (staff.password_hash.startsWith("$2a$") || staff.password_hash.startsWith("$2b$")) {
      isValid = await bcrypt.compare(password, staff.password_hash);
    } else {
      // Legacy SHA-256 validation
      const inputHash = crypto.createHash("sha256").update(password).digest("hex");
      if (staff.password_hash === inputHash) {
        isValid = true;
        needsUpgrade = true;
      }
    }

    if (!isValid) {
      await recordLoginFailure(ipKey);
      await recordLoginFailure(emailKey);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (needsUpgrade) {
      // Upgrade to bcrypt transparently
      const newHash = await bcrypt.hash(password, 12);
      await sb.from("staff").update({ password_hash: newHash }).eq("id", staff.id);
    }

    // Reset login attempts on successful credentials validation
    await resetLoginAttempts(ipKey);
    await resetLoginAttempts(emailKey);

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
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 days persistent login

    cookieStore.set("staff_session", JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: expires,
      sameSite: "lax",
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
