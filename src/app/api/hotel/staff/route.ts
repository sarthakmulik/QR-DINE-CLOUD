export const dynamic = "force-dynamic";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { hotelId, hotelPlan } = await requireHotelAccess();
    const sb = createAdminClient();

    // Check staff access from plan (no extra DB query needed)
    if (!hotelPlan || hotelPlan.toLowerCase() === "basic") {
      return NextResponse.json({ error: "Feature locked under Basic plan." }, { status: 403 });
    }

    const { data: staff, error } = await sb
      .from("staff")
      .select("id, name, role, email")
      .eq("hotel_id", hotelId)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json(staff);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hotelId, hotelPlan } = await requireHotelAccess();
    const body = await req.json();

    const { name, role, email, password } = body;
    if (!name || !role || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (password.length < 4 || password.length > 72) {
      return NextResponse.json({ error: "Password/PIN must be between 4 and 72 characters." }, { status: 400 });
    }

    const sb = createAdminClient();

    // Enforce plan limits (no extra DB query needed)
    if (!hotelPlan) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    const plan = hotelPlan.toLowerCase();
    if (plan === "basic") {
      return NextResponse.json({ error: "Staff management is not available on Basic plan." }, { status: 403 });
    }

    const maxStaff = plan === "pro" ? 5 : Infinity;

    if (maxStaff !== Infinity) {
      const { count, error: countError } = await sb
        .from("staff")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotelId);

      if (countError) throw countError;

      if ((count || 0) >= maxStaff) {
        return NextResponse.json(
          { error: `Staff account limit of ${maxStaff} reached on the Pro plan.` },
          { status: 403 }
        );
      }
    }

    // 1. Create auth user in Supabase Auth
    const { data: authData, error: authError } = await sb.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: password,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      const errorMsg = authError?.message || "Failed to create authentication credentials.";
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const authUserId = authData.user.id;

    // 2. Insert profile record
    const { error: profileError } = await sb
      .from("profiles")
      .insert({
        id: authUserId,
        email: String(email).trim().toLowerCase(),
        name: String(name).trim(),
        role: "staff",
        hotel_id: hotelId,
      });

    if (profileError) {
      await sb.auth.admin.deleteUser(authUserId);
      if (profileError.code === "23505") {
        return NextResponse.json({ error: "A profile with this email already exists." }, { status: 400 });
      }
      return NextResponse.json({ error: "Failed to create staff profile." }, { status: 500 });
    }

    // 3. Insert staff record
    const { data: staff, error: staffError } = await sb
      .from("staff")
      .insert({
        id: authUserId,
        hotel_id: hotelId,
        name: String(name).trim(),
        role,
        email: String(email).trim().toLowerCase(),
        password_hash: await bcrypt.hash(password, 12),
      })
      .select("id, name, role, email")
      .single();

    if (staffError) {
      await sb.from("profiles").delete().eq("id", authUserId);
      await sb.auth.admin.deleteUser(authUserId);
      if (staffError.code === "23505") {
        return NextResponse.json({ error: "A staff member with this email already exists." }, { status: 400 });
      }
      return NextResponse.json({ error: "Failed to create staff entry." }, { status: 500 });
    }

    return NextResponse.json(staff);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

