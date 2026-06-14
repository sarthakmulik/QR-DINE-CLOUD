import { createClient } from "@/lib/supabase/server";
import type { AuthUser } from "@/lib/types";
import { findProfileForUser } from "@/lib/profile";
import { cookies } from "next/headers";
import { cache } from "react";

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
        return {
          id: parsed.id,
          email: parsed.email,
          name: parsed.name,
          role: "staff",
          hotelId: parsed.hotelId,
          hotelPlan: parsed.hotelPlan || "pro",
        };
      }
    } catch {
      return null;
    }
    return null;
  }
  const profile = await findProfileForUser(user.id, user.email);

  if (!profile) return null;

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
