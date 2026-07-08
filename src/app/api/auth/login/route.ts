import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { findProfileForUser } from "@/lib/profile";
import { checkLoginRateLimit, recordLoginFailure, resetLoginAttempts } from "@/lib/rate-limit";

function sanitizeRedirectPath(redirect?: string): string {
  if (!redirect) return "/dashboard";
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return "/dashboard";
  if (redirect === "/" || redirect === "/login") return "/dashboard";
  if (redirect.startsWith("/admin")) return "/dashboard";
  return redirect;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const requestedRedirect =
    typeof body?.redirect === "string" ? body.redirect : undefined;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Prevent multiple long password DoS attacks (ceiling of 72 characters)
  if (password.length < 6 || password.length > 72) {
    return NextResponse.json(
      { error: "Password must be between 6 and 72 characters" },
      { status: 400 }
    );
  }

  // Rate Limiting / Lockout checks
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "127.0.0.1";
  const ipKey = `ip:${ip}`;
  const emailKey = `email:${email.trim().toLowerCase()}`;

  const ipLimit = await checkLoginRateLimit(ipKey);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: `Too many login attempts from this IP. Please try again in ${Math.ceil(ipLimit.lockTimeLeft / 60)} minutes.` },
      { status: 429 }
    );
  }

  const emailLimit = await checkLoginRateLimit(emailKey);
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: `This account is temporarily locked due to too many failed login attempts. Please try again in ${Math.ceil(emailLimit.lockTimeLeft / 60)} minutes.` },
      { status: 429 }
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (signInError) {
    await recordLoginFailure(ipKey);
    await recordLoginFailure(emailKey);
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  // Reset login attempts on successful credentials validation
  await resetLoginAttempts(ipKey);
  await resetLoginAttempts(emailKey);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in failed" }, { status: 401 });
  }
  const profile = await findProfileForUser(user.id, user.email);

  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.json(
      {
        error:
          "Your account is not set up yet. Ask an admin to assign your profile role.",
      },
      { status: 403 }
    );
  }

  let redirectTo = "";
  if (profile.role === "superadmin") {
    redirectTo = "/admin";
  } else if (profile.role === "staff") {
    redirectTo = "/staff";
  } else {
    redirectTo = sanitizeRedirectPath(requestedRedirect);
  }

  const jsonResponse = NextResponse.json({ redirectTo });

  supabaseResponse.cookies.getAll().forEach((cookie) => {
    jsonResponse.cookies.set(cookie);
  });

  return jsonResponse;
}
