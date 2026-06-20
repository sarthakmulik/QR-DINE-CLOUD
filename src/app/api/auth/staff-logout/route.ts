import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();

  // Clear the httpOnly staff_session cookie
  cookieStore.set("staff_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
    expires: new Date(0),
  });

  return NextResponse.json({ success: true });
}
