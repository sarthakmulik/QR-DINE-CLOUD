import { NextResponse } from "next/server";

export function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "public, max-age=86400",
    },
  });
}
