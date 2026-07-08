import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  lockTimeLeft: number; // in seconds
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function checkLoginRateLimit(key: string): Promise<RateLimitResult> {
  const sb = createAdminClient();
  const { data } = await sb.from("rate_limits").select("*").eq("key", key).maybeSingle();

  if (!data) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, lockTimeLeft: 0 };
  }

  const now = new Date();
  let lockUntil = data.lock_until ? new Date(data.lock_until) : null;

  if (lockUntil && now < lockUntil) {
    const lockTimeLeft = Math.ceil((lockUntil.getTime() - now.getTime()) / 1000);
    return { allowed: false, remainingAttempts: 0, lockTimeLeft };
  }

  if (lockUntil && now >= lockUntil && data.attempts >= MAX_ATTEMPTS) {
    await sb.from("rate_limits").delete().eq("key", key);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, lockTimeLeft: 0 };
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - data.attempts),
    lockTimeLeft: 0,
  };
}

export async function recordLoginFailure(key: string): Promise<RateLimitResult> {
  const sb = createAdminClient();
  const { data: existing } = await sb.from("rate_limits").select("*").eq("key", key).maybeSingle();

  const now = new Date();
  
  if (!existing) {
    await sb.from("rate_limits").insert({ key, attempts: 1 });
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS - 1, lockTimeLeft: 0 };
  }

  let newAttempts = existing.attempts + 1;
  let lockUntil = existing.lock_until ? new Date(existing.lock_until) : null;

  if (newAttempts >= MAX_ATTEMPTS) {
    lockUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
  }

  await sb.from("rate_limits").update({
    attempts: newAttempts,
    lock_until: lockUntil ? lockUntil.toISOString() : null,
  }).eq("key", key);

  const lockTimeLeft = lockUntil && lockUntil > now ? Math.ceil((lockUntil.getTime() - now.getTime()) / 1000) : 0;
  
  return {
    allowed: newAttempts < MAX_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - newAttempts),
    lockTimeLeft,
  };
}

export async function resetLoginAttempts(key: string): Promise<void> {
  const sb = createAdminClient();
  await sb.from("rate_limits").delete().eq("key", key);
}
