interface AttemptData {
  count: number;
  lockUntil: number;
}

const loginAttempts = new Map<string, AttemptData>();

// Clean up expired entries periodically to prevent memory leaks
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of loginAttempts.entries()) {
      if (now > data.lockUntil && data.count >= 5) {
        loginAttempts.delete(key);
      } else if (now > data.lockUntil + 3600000) { // stale entries older than 1 hour
        loginAttempts.delete(key);
      }
    }
  }, 60000); // every minute
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  lockTimeLeft: number; // in seconds
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(key: string): RateLimitResult {
  const data = loginAttempts.get(key);
  if (!data) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, lockTimeLeft: 0 };
  }

  const now = Date.now();
  if (now < data.lockUntil) {
    const lockTimeLeft = Math.ceil((data.lockUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, lockTimeLeft };
  }

  // Lock expired, reset count or allow attempt
  if (now >= data.lockUntil && data.count >= MAX_ATTEMPTS) {
    loginAttempts.delete(key);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, lockTimeLeft: 0 };
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - data.count),
    lockTimeLeft: 0,
  };
}

export function recordLoginFailure(key: string): RateLimitResult {
  const now = Date.now();
  let data = loginAttempts.get(key);

  if (!data) {
    data = { count: 0, lockUntil: 0 };
  }

  data.count += 1;
  if (data.count >= MAX_ATTEMPTS) {
    data.lockUntil = now + LOCKOUT_DURATION;
  }

  loginAttempts.set(key, data);

  const lockTimeLeft = data.lockUntil > now ? Math.ceil((data.lockUntil - now) / 1000) : 0;
  return {
    allowed: data.count < MAX_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - data.count),
    lockTimeLeft,
  };
}

export function resetLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}
