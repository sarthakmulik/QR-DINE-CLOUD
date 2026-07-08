import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await props.params;
    const body = await req.json();

    if (body.password) {
      if (body.password.length < 4 || body.password.length > 72) {
        return NextResponse.json({ error: "Password/PIN must be between 4 and 72 characters." }, { status: 400 });
      }
    }

    const sb = createAdminClient();

    // 1. If email or password is changed, update them in Supabase Auth
    const authUpdates: Record<string, any> = {};
    if (body.email) authUpdates.email = String(body.email).trim().toLowerCase();
    if (body.password) authUpdates.password = body.password;

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await sb.auth.admin.updateUserById(id, authUpdates);
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    }

    // 2. Update profiles table
    const profileUpdates: Record<string, any> = {};
    if (body.name) profileUpdates.name = String(body.name).trim();
    if (body.email) profileUpdates.email = String(body.email).trim().toLowerCase();

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await sb
        .from("profiles")
        .update(profileUpdates)
        .eq("id", id);
      if (profileError) {
        if (profileError.code === "23505") {
          return NextResponse.json({ error: "A profile with this email already exists." }, { status: 400 });
        }
        throw profileError;
      }
    }

    // 3. Update staff table
    const updates: Record<string, any> = {};
    if (body.name) updates.name = String(body.name).trim();
    if (body.role) updates.role = body.role;
    if (body.email) updates.email = String(body.email).trim().toLowerCase();
    if (body.password) {
      updates.password_hash = await bcrypt.hash(body.password, 12);
    }

    const { data: staff, error: staffError } = await sb
      .from("staff")
      .update(updates)
      .eq("id", id)
      .eq("hotel_id", hotelId)
      .select("id, name, role, email")
      .single();

    if (staffError) {
      if (staffError.code === "23505") {
        return NextResponse.json({ error: "A staff member with this email already exists." }, { status: 400 });
      }
      throw staffError;
    }

    return NextResponse.json(staff);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { hotelId } = await requireHotelAccess();
    const { id } = await props.params;

    const sb = createAdminClient();

    // 1. Delete from staff table
    const { error: staffError } = await sb
      .from("staff")
      .delete()
      .eq("id", id)
      .eq("hotel_id", hotelId);

    if (staffError) throw staffError;

    // 2. Delete from profiles (just to be safe)
    await sb
      .from("profiles")
      .delete()
      .eq("id", id);

    // 3. Delete from Supabase Auth
    const { error: authError } = await sb.auth.admin.deleteUser(id);
    if (authError) {
      console.warn("Auth user deletion warning:", authError.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
