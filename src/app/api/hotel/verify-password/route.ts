import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireHotelAccess();
    
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // Verify password against Supabase Auth
    // We instantiate a fresh client to test the password without affecting the main session
    const sb = createAdminClient();
    
    // We use signInWithPassword to verify if the password matches the user's email
    // This is the most secure way since we don't have direct access to password hashes
    const { data, error } = await sb.auth.signInWithPassword({
      email: user.email!,
      password: String(password),
    });

    if (error || !data.session) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Immediately sign out this temporary admin client session to keep things clean
    await sb.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Password verification error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
