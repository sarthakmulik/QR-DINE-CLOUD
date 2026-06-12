import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapHotel } from "@/lib/types";
import type { Hotel } from "@/lib/types";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const { data: hotel, error } = await createAdminClient()
      .from("hotels")
      .select("*")
      .eq("id", hotelId)
      .single<Hotel>();

    if (error || !hotel) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(mapHotel(hotel));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, hotelId } = await requireHotelAccess();
    const userId = user.id;
    const body = await req.json();
    const sb = createAdminClient();

    // Fetch current hotel details first
    const { data: currentHotel, error: getError } = await sb
      .from("hotels")
      .select("status")
      .eq("id", hotelId)
      .single<Hotel>();

    if (getError || !currentHotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    if (currentHotel.status === "suspended") {
      return NextResponse.json({ error: "Hotel is suspended. Please contact support." }, { status: 403 });
    }

    // Check if updating email
    if (body.email !== undefined) {
      const newEmail = String(body.email).trim().toLowerCase();
      if (!newEmail.includes("@") || newEmail.length < 5) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }

      if (newEmail !== user.email?.toLowerCase()) {
        const { error: authUpdateError } = await sb.auth.admin.updateUserById(userId, {
          email: newEmail,
          email_confirm: true,
        });

        if (authUpdateError) {
          console.error("Auth email update error:", authUpdateError);
          return NextResponse.json(
            { error: authUpdateError.message || "Failed to update email in authentication. It may already be in use." },
            { status: 400 }
          );
        }

        const { error: profileError } = await sb
          .from("profiles")
          .update({ email: newEmail })
          .eq("id", userId);

        if (profileError) {
          console.error("Profile email update error:", profileError);
        }

        const { error: hotelEmailError } = await sb
          .from("hotels")
          .update({ owner_email: newEmail, login_email: newEmail })
          .eq("id", hotelId);

        if (hotelEmailError) {
          console.error("Hotel email update error:", hotelEmailError);
        }
      }
    }

    // Check if updating password
    if (body.password) {
      const newPassword = String(body.password);
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters long" }, { status: 400 });
      }

      const { error: authPassError } = await sb.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (authPassError) {
        console.error("Auth password update error:", authPassError);
        return NextResponse.json(
          { error: authPassError.message || "Failed to update password." },
          { status: 400 }
        );
      }
    }

    const updates: any = {};

    if (body.name !== undefined) {
      updates.name = String(body.name || "").trim();
      if (!updates.name) {
        return NextResponse.json({ error: "Restaurant name is required" }, { status: 400 });
      }
    }

    if (body.address !== undefined) {
      updates.address = String(body.address || "").trim() || null;
    }

    if (body.gstNumber !== undefined) {
      updates.gst_number = String(body.gstNumber || "").trim() || null;
    }

    if (body.logo !== undefined) {
      updates.logo = String(body.logo || "").trim() || null;
    }

    if (body.taxRate !== undefined) {
      const taxRate = Number(body.taxRate);
      if (isNaN(taxRate) || taxRate < 0 || taxRate > 50) {
        return NextResponse.json({ error: "Tax rate must be between 0 and 50%" }, { status: 400 });
      }
      updates.tax_rate = taxRate;
    }

    if (body.kitchenPin !== undefined) {
      const pin = String(body.kitchenPin || "").replace(/\D/g, "");
      if (pin && pin.length !== 4) {
        return NextResponse.json({ error: "Kitchen PIN must be exactly 4 digits" }, { status: 400 });
      }
      updates.kitchen_pin = pin || null;
    }

    if (body.upiId !== undefined) {
      updates.upi_id = String(body.upiId || "").trim() || null;
    }

    if (body.status !== undefined) {
      const status = String(body.status);
      if (status !== "active" && status !== "paused") {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }
      updates.status = status;
    }

    if (body.secureQr !== undefined) {
      updates.secure_qr = Boolean(body.secureQr);
    }

    if (body.customizations !== undefined) {
      updates.customizations = body.customizations;
    }

    // Only apply update if updates object is not empty
    if (Object.keys(updates).length > 0) {
      const { data: hotel, error } = await sb
        .from("hotels")
        .update(updates)
        .eq("id", hotelId)
        .select("*")
        .single<Hotel>();

      if (error) {
        console.error("Profile update DB error:", error);
        if (error.message?.includes("customizations") || error.message?.includes("secure_qr") || error.code === "42703") {
          return NextResponse.json({
            error: "Failed to update settings. Please make sure you have executed the database migration scripts (specifically adding customizations and secure_qr columns) in your Supabase SQL Editor."
          }, { status: 400 });
        }
        throw error;
      }
      return NextResponse.json(mapHotel(hotel));
    }

    // If no database updates, fetch fresh hotel to return
    const { data: hotel, error } = await sb
      .from("hotels")
      .select("*")
      .eq("id", hotelId)
      .single<Hotel>();

    if (error || !hotel) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(mapHotel(hotel));
  } catch (err: any) {
    console.error("Hotel profile patch error:", err);
    return NextResponse.json({ error: err.message || "Unauthorized" }, { status: 401 });
  }
}
