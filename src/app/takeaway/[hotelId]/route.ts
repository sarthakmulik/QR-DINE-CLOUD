import { NextRequest, NextResponse } from "next/server";
import { getTableSignature } from "@/lib/crypto";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ hotelId: string }> }
) {
  const { hotelId } = await params;
  
  const cookieStore = await cookies();
  const cookieName = `takeaway_table_${hotelId}`;
  
  let virtualTableNumber: number;
  const existingCookie = cookieStore.get(cookieName);
  
  if (existingCookie && existingCookie.value && parseInt(existingCookie.value) >= 900000) {
    virtualTableNumber = parseInt(existingCookie.value);
  } else {
    // Generate a random virtual table number between 900000 and 999999
    virtualTableNumber = Math.floor(900000 + Math.random() * 100000);
  }
  
  const signature = getTableSignature(hotelId, virtualTableNumber);
  
  const redirectUrl = new URL(`/dine/${hotelId}/${virtualTableNumber}?sign=${signature}`, req.url);
  
  const response = NextResponse.redirect(redirectUrl);
  
  // Set the cookie so if the customer scans the generic QR code again,
  // they are redirected to their existing virtual table and can track their order.
  response.cookies.set(cookieName, virtualTableNumber.toString(), {
    path: '/',
    maxAge: 60 * 60 * 4, // 4 hours
    httpOnly: true,
    sameSite: 'lax',
  });
  
  return response;
}
