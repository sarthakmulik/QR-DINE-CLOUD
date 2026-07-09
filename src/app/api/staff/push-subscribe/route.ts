import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/staff/push-subscribe — Save a push subscription for this hotel
export async function POST(req: NextRequest) {
  try {
    const { hotelId, user } = await requireHotelAccess();
    const body = await req.json();
    const { endpoint, keys, fcmToken } = body;

    if (!fcmToken && (!endpoint || !keys?.p256dh || !keys?.auth)) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    const sb = createAdminClient();

    // Upsert so re-subscribing the same browser/app doesn't create duplicates
    const { error } = await sb.from("push_subscriptions").upsert(
      {
        hotel_id: hotelId,
        staff_id: user.role === "staff" ? user.id : null,
        endpoint: fcmToken || endpoint,
        p256dh: fcmToken ? 'fcm' : keys.p256dh,
        auth: fcmToken ? 'fcm' : keys.auth,
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Push subscribe error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// DELETE /api/staff/push-subscribe — Remove a push subscription (user opted out)
export async function DELETE(req: NextRequest) {
  try {
    await requireHotelAccess();
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    const sb = createAdminClient();
    await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Push unsubscribe error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
