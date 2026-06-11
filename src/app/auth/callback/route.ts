import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { findProfileForUser } from "@/lib/profile";

function sanitizeRedirectPath(redirect?: string | null): string {
  if (!redirect) return "/dashboard";
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return "/dashboard";
  if (redirect === "/" || redirect === "/login") return "/dashboard";
  if (redirect.startsWith("/admin")) return "/dashboard";
  return redirect;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") || "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const profile = await findProfileForUser(user.id, user.email);

        if (!profile) {
          return NextResponse.redirect(`${origin}/login?error=no_profile`);
        }

        const dest =
          profile.role === "superadmin"
            ? "/admin"
            : sanitizeRedirectPath(redirect);
        return NextResponse.redirect(`${origin}${dest}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
