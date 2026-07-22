import { createClient } from "@/lib/supabase/server";
import type { AuthUser } from "@/lib/types";
import { findProfileForUser } from "@/lib/profile";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { cache } from "react";
import crypto from "crypto";

function verifyStaffToken(signedToken: string | undefined): string | null {
  if (!signedToken || !signedToken.includes("|")) return null;
  const parts = signedToken.split("|");
  if (parts.length < 3) return null;
  const [staffId, timestamp, signature] = parts;
  
  // Enforce 24-hour expiry on staff tokens
  if (Date.now() - parseInt(timestamp, 10) > 86400000) {
    return null;
  }

  const tokenPayload = `${staffId}|${timestamp}`;
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!salt) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for authentication");
  }

  const expectedSignature = crypto.createHmac("sha256", salt).update(tokenPayload).digest("hex");
  if (signature === expectedSignature) return staffId;
  return null;
}

export const SUPER_ADMIN_EMAIL = "sarthakmulik16@gmail.com";

export const getAuthUser = cache(async function (): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user?.email) {
    try {
      const cookieStore = await cookies();
      const staffSession = cookieStore.get("staff_session")?.value;
      if (staffSession) {
        const parsed = JSON.parse(staffSession);
        
        const verifiedStaffId = verifyStaffToken(parsed.signedToken);
        if (verifiedStaffId) {
          // Validate against DB to prevent cookie forgery
          const sb = createAdminClient();
          const { data: staff } = await sb
            .from("staff")
            .select("*, hotels(plan)")
            .eq("id", verifiedStaffId)
            .maybeSingle();

          if (staff) {
            return {
              id: staff.id,
              email: staff.email,
              name: staff.name,
              role: "staff",
              hotelId: staff.hotel_id,
              hotelPlan: (staff.hotels as any)?.plan || "pro",
            };
          }
        }
      }
    } catch {
      // Fallthrough
    }
    
    // Stateless Header Fallback (For Android Capacitor WebView which strictly drops cookies)
    try {
      const headersList = await headers();
      const staffIdToken = headersList.get("x-staff-id");
      if (staffIdToken) {
        const verifiedStaffId = verifyStaffToken(staffIdToken);
        if (verifiedStaffId) {
          const sb = createAdminClient();
          const { data: staff } = await sb
            .from("staff")
            .select("*, hotels(plan)")
            .eq("id", verifiedStaffId)
            .maybeSingle();

          if (staff) {
            return {
              id: staff.id,
              email: staff.email,
              name: staff.name,
              role: "staff",
              hotelId: staff.hotel_id,
              hotelPlan: (staff.hotels as any)?.plan || "pro",
            };
          }
        }
      }
    } catch {
      // Fallthrough
    }

    return null;
  }
  const profile = await findProfileForUser(user.id, user.email);

  if (!profile) return null;

  const cookieStore = await cookies();
  const impersonateHotelId = cookieStore.get("impersonate_hotel_id")?.value;

  if (profile.role === "superadmin" && impersonateHotelId) {
    const sb = createAdminClient();
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan")
      .eq("id", impersonateHotelId)
      .maybeSingle();

    if (hotel) {
      return {
        id: user.id,
        email: user.email,
        name: profile.name,
        role: "hotel_owner",
        hotelId: impersonateHotelId,
        hotelPlan: hotel.plan || "pro",
        isImpersonating: true,
        originalAdminId: user.id,
      };
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: profile.name,
    role: profile.role,
    hotelId: profile.hotel_id,
    hotelPlan: (profile as any).hotels?.plan || "basic",
  };
});

export async function requireSuperAdmin() {
  const user = await getAuthUser();
  if (!user || user.role !== "superadmin") {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireHotelAccess(hotelId?: string) {
  const user = await getAuthUser();
  if (!user) throw new Error("Unauthorized");

  if (user.role === "superadmin") {
    throw new Error("Super admin cannot access hotel panel");
  }

  if (user.role !== "hotel_owner" && user.role !== "staff") {
    throw new Error("Unauthorized");
  }

  const targetHotelId = hotelId || user.hotelId;
  if (!targetHotelId || user.hotelId !== targetHotelId) {
    throw new Error("Forbidden");
  }

  return { user, hotelId: targetHotelId, hotelPlan: user.hotelPlan || "basic" };
}
