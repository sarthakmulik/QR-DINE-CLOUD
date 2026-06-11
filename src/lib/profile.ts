import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import { cache } from "react";

export const findProfileForUser = cache(async function (
  userId: string,
  email?: string | null
): Promise<Profile | null> {
  const sb = createAdminClient();

  const { data: byId } = await sb
    .from("profiles")
    .select("*, hotels(plan)")
    .eq("id", userId)
    .maybeSingle<any>();

  if (byId) return byId;

  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();
  const { data: byEmail } = await sb
    .from("profiles")
    .select("*, hotels(plan)")
    .eq("email", normalizedEmail)
    .maybeSingle<any>();

  return byEmail ?? null;
});
