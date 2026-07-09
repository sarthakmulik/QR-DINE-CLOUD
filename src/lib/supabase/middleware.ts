import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { findProfileForUser } from "@/lib/profile";

const PUBLIC_PATHS = ["/login", "/dine", "/bill", "/auth", "/api/auth", "/kitchen", "/staff"];

function isPublicPath(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  if (user) {
    let role: string | null = null;
    try {
      const profile = await findProfileForUser(user.id, user.email);
      role = profile?.role ?? null;
    } catch {
      role = null;
    }

    if (path.startsWith("/admin") && role !== "superadmin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (path.startsWith("/dashboard") && role === "superadmin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    if (path === "/login") {
      if (!role) {
        return supabaseResponse;
      }
      return NextResponse.redirect(
        new URL(role === "superadmin" ? "/admin" : "/dashboard", request.url)
      );
    }

    if (path === "/") {
      if (!role) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "no_profile");
        return NextResponse.redirect(url);
      }
      return NextResponse.redirect(
        new URL(role === "superadmin" ? "/admin" : "/dashboard", request.url)
      );
    }
  }

  return supabaseResponse;
}
