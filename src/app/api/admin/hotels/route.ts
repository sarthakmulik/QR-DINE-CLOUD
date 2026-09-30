import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateLoginEmail, generatePassword } from "@/lib/utils";
import { sendCredentialsEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { mapHotel } from "@/lib/types";
import type { Hotel, HotelPlan } from "@/lib/types";

export async function GET() {
  try {
    await requireSuperAdmin();
    const sb = createAdminClient();

    const { data: hotels, error } = await sb
      .from("hotels")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json((hotels as Hotel[]).map(mapHotel));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin();
    const body = await req.json();
    const sb = createAdminClient();

    const {
      name,
      ownerName,
      ownerEmail,
      ownerPhone,
      plan,
      serviceType,
      billingAmount,
      useGoogleOAuth,
      organizationId, // NEW FIELD
    } = body;

    if (!name || !ownerName || !ownerEmail || !ownerPhone || !plan || !serviceType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const loginEmail = generateLoginEmail(name);
    const password = generatePassword();
    const authEmail = useGoogleOAuth ? ownerEmail.toLowerCase() : loginEmail;

    const nextDueDate = new Date();
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);

    // 1. Create Organization if it's a new standalone master franchise
    let activeOrgId = organizationId;
    if (!activeOrgId) {
      const { data: newOrg, error: orgError } = await sb
        .from("organizations")
        .insert({ name: `${ownerName}'s Group` })
        .select("id")
        .single();
      
      if (!orgError && newOrg) {
        activeOrgId = newOrg.id;
      }
    }

    // 2. Create Hotel linked to the Organization
    const { data: hotel, error: hotelError } = await sb
      .from("hotels")
      .insert({
        name,
        owner_name: ownerName,
        owner_email: ownerEmail.toLowerCase(),
        owner_phone: ownerPhone,
        login_email: loginEmail,
        plan: plan as HotelPlan,
        service_type: serviceType,
        billing_amount: parseFloat(billingAmount) || 0,
        next_due_date: nextDueDate.toISOString(),
        organization_id: activeOrgId || null,
      })
      .select("*")
      .single<Hotel>();

    if (hotelError || !hotel) {
      throw new Error(hotelError?.message || "Failed to create hotel");
    }

    // 3. Create Branch Manager / Owner Auth User
    const { data: authUser, error: authError } = await sb.auth.admin.createUser({
      email: authEmail,
      password: useGoogleOAuth ? undefined : password,
      email_confirm: true,
      user_metadata: { name: ownerName },
    });

    if (authError || !authUser.user) {
      await sb.from("hotels").delete().eq("id", hotel.id);
      throw new Error(authError?.message || "Failed to create auth user");
    }

    // 4. Create Profile for Branch Manager
    const { error: profileError } = await sb.from("profiles").insert({
      id: authUser.user.id,
      email: authEmail,
      name: ownerName,
      role: "hotel_owner",
      hotel_id: hotel.id,
    });

    if (profileError) {
      await sb.auth.admin.deleteUser(authUser.user.id);
      await sb.from("hotels").delete().eq("id", hotel.id);
      throw new Error(profileError.message);
    }

    // 5. If this is a brand new franchise (no organizationId passed), assign this new user as the Master Owner
    if (!organizationId && activeOrgId) {
      await sb.from("organization_members").insert({
        organization_id: activeOrgId,
        user_id: authUser.user.id,
        role: "owner"
      });
    }

    let emailResult = { sent: false, message: "Skipped" };
    if (!useGoogleOAuth) {
      emailResult = await sendCredentialsEmail({
        to: ownerEmail,
        ownerName,
        hotelName: name,
        loginEmail,
        password,
      });
    }

    await logAudit({
      hotelId: hotel.id,
      userId: user.id,
      action: "CREATE_HOTEL",
      entityType: "hotel",
      entityId: hotel.id,
      details: { name: hotel.name, plan: hotel.plan },
    });

    return NextResponse.json({
      hotel: mapHotel(hotel),
      credentials: useGoogleOAuth
        ? { message: "Owner can sign in with Google using their Gmail" }
        : { loginEmail, password, emailResult },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
  }
}
