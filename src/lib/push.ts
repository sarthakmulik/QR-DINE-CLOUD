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
              data: {
                url: payloadData.url || "",
                tag: payloadData.tag || ""
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
) {
  try {
    const sb = createAdminClient();
    const { data: subscriptions } = await sb
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("hotel_id", hotelId)
      .order("endpoint", { ascending: true }); // Ensure stable ordering

    if (!subscriptions || subscriptions.length === 0) return;

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
            data: {
              url: payloadData.url || "",
              tag: payloadData.tag || ""
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
        console.log(`[Push] Successfully routed to index ${currentIndex}`);
        break; // Stop routing! One waiter received the call.
      }

      // If it failed (e.g. ghost/dead subscription), try the next waiter in line
      attempts++;
      currentIndex = (currentIndex + 1) % subscriptions.length;
    }
  } catch (err) {
    console.error("Sequential push notification dispatch failed:", err);
  }
}
