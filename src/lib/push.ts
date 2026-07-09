import { createAdminClient } from "@/lib/supabase/admin";
import webpush from "web-push";

// Configure VAPID — only if keys are present (graceful fallback for local dev)
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    "mailto:admin@qrdinecoud.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/** Fire push notifications to all subscribed staff for this hotel — non-blocking */
export async function sendStaffPush(
  hotelId: string,
  payloadData: { title: string; body: string; tag: string; url: string; channelId?: string },
  assignedStaffId?: string
) {
  try {
    const sb = createAdminClient();
    let query = sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, staff_id")
      .eq("hotel_id", hotelId);
      
    if (assignedStaffId) {
      query = query.eq("staff_id", assignedStaffId);
    }

    let { data: subscriptions } = await query;

    if (!subscriptions || subscriptions.length === 0) return;

    // Filter by active attendance
    const { data: activeShifts } = await sb
      .from("staff_attendance")
      .select("staff_id")
      .eq("hotel_id", hotelId)
      .is("clock_out", null);

    // Filter by active attendance: Admins/Unlinked devices (!staff_id) pass. Waiters must be clocked in.
    const activeStaffIds = new Set((activeShifts || []).map(s => s.staff_id));
    subscriptions = subscriptions.filter(sub => !sub.staff_id || activeStaffIds.has(sub.staff_id));

    if (subscriptions.length === 0) return;

    const webPayload = JSON.stringify(payloadData);

    // Fire all push notifications in parallel — ignore individual failures
    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        if (sub.p256dh === "fcm") {
          try {
            const { messaging } = await import("@/lib/firebase");
            return await messaging.send({
              token: sub.endpoint,
              notification: {
                title: payloadData.title,
                body: payloadData.body,
              },
              android: {
                priority: "high",
                notification: {
                  icon: "ic_launcher_round",
                  sound: "default",
                  channelId: payloadData.channelId || "waiter_alerts"
                }
              }
            });
          } catch (err: any) {
            if (err?.code === 'messaging/registration-token-not-registered') {
              sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        } else if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
          return await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            webPayload
          ).catch((err: any) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          });
        }
      })
    );
  } catch (err) {
    // Push failure must NEVER affect the core request flow
    console.error("Push notification dispatch failed (non-critical):", err);
  }
}
/** Fire a push notification to exactly ONE subscribed staff for this hotel sequentially */
export async function sendStaffPushSequential(
  hotelId: string,
  payloadData: { title: string; body: string; tag: string; url: string; channelId?: string }
): Promise<string | null> {
  try {
    const sb = createAdminClient();
    let { data: subscriptions } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, staff_id")
      .eq("hotel_id", hotelId)
      .order("endpoint", { ascending: true }); // Ensure stable ordering

    if (!subscriptions || subscriptions.length === 0) return null;

    // Filter by active attendance
    const { data: activeShifts } = await sb
      .from("staff_attendance")
      .select("staff_id")
      .eq("hotel_id", hotelId)
      .is("clock_out", null);

    // Filter by active attendance: Admins/Unlinked devices (!staff_id) pass. Waiters must be clocked in.
    const activeStaffIds = new Set((activeShifts || []).map(s => s.staff_id));
    subscriptions = subscriptions.filter(sub => !sub.staff_id || activeStaffIds.has(sub.staff_id));

    if (subscriptions.length === 0) return null;

    // EXCLUSIVE ANDROID ROUTING: 
    // To completely prevent "Ghost" Web Browsers from swallowing round-robin notifications,
    // if ANY Android (FCM) devices exist, we exclusively round-robin between Android devices!
    const fcmSubs = subscriptions.filter(s => s.p256dh === "fcm");
    if (fcmSubs.length > 0) {
      subscriptions = fcmSubs;
    }

    // Use DB state for stateless round-robin (Serverless safe)
    const { count } = await sb
      .from("waiter_requests")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId);

    const nextIndex = (count || 0) % subscriptions.length;
    
    const webPayload = JSON.stringify(payloadData);

    let attempts = 0;
    let currentIndex = nextIndex;

    while (attempts < subscriptions.length) {
      const sub = subscriptions[currentIndex];
      let success = true;

      console.log(`[Push] Attempting sequential routing to index ${currentIndex} (of ${subscriptions.length})`);

      if (sub.p256dh === "fcm") {
        try {
          const { messaging } = await import("@/lib/firebase");
          await messaging.send({
            token: sub.endpoint,
            notification: {
              title: payloadData.title,
              body: payloadData.body,
            },
            android: {
              priority: "high",
              notification: {
                icon: "ic_launcher_round",
                sound: "default",
                channelId: payloadData.channelId || "waiter_alerts"
              }
            }
          });
        } catch (err: any) {
          success = false;
          if (err?.code === 'messaging/registration-token-not-registered') {
            await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      } else if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            webPayload
          );
        } catch (err: any) {
          success = false;
          if (err.statusCode === 404 || err.statusCode === 410) {
            await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      } else {
        success = false;
      }

      if (success) {
        console.log(`[Push] Successfully routed to index ${currentIndex} (Staff: ${sub.staff_id})`);
        return sub.staff_id || null;
      }

      // If it failed (e.g. ghost/dead subscription), try the next waiter in line
      attempts++;
      currentIndex = (currentIndex + 1) % subscriptions.length;
    }
    return null;
  } catch (err) {
    console.error("Sequential push notification dispatch failed:", err);
    return null;
  }
}
