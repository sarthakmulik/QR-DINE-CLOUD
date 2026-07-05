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
  payloadData: { title: string; body: string; tag: string; url: string; channelId?: string }
) {
  try {
    const sb = createAdminClient();
    const { data: subscriptions } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("hotel_id", hotelId);

    if (!subscriptions || subscriptions.length === 0) return;

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

// In-memory map to track the last assigned index for sequential round-robin routing
const lastAssignedIndex = new Map<string, number>();

/** Fire a push notification to exactly ONE subscribed staff for this hotel sequentially */
export async function sendStaffPushSequential(
  hotelId: string,
  payloadData: { title: string; body: string; tag: string; url: string; channelId?: string }
) {
  try {
    const sb = createAdminClient();
    const { data: subscriptions } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("hotel_id", hotelId);

    if (!subscriptions || subscriptions.length === 0) return;

    // Determine which subscription gets the notification
    const currentIndex = lastAssignedIndex.get(hotelId) ?? -1;
    const nextIndex = (currentIndex + 1) % subscriptions.length;
    lastAssignedIndex.set(hotelId, nextIndex);
    
    const sub = subscriptions[nextIndex];
    console.log(`[Push] Routing sequential notification to index ${nextIndex} (of ${subscriptions.length}) for hotel ${hotelId}`);

    const webPayload = JSON.stringify(payloadData);

    // Send to the selected subscription
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
        if (err?.code === 'messaging/registration-token-not-registered') {
          sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    } else if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        webPayload
      ).catch((err: any) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      });
    }
  } catch (err) {
    console.error("Sequential push notification dispatch failed:", err);
  }
}
