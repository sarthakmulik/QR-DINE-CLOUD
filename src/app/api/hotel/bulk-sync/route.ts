import { NextRequest, NextResponse } from "next/server";
import { POST as createSession } from "@/app/api/hotel/sessions/route";
import { POST as addItems } from "@/app/api/hotel/sessions/[id]/items/route";
import { POST as checkout } from "@/app/api/hotel/sessions/[id]/checkout/route";
import { POST as pay } from "@/app/api/hotel/sessions/[id]/pay/route";
import { POST as applyCoupon } from "@/app/api/hotel/sessions/[id]/apply-coupon/route";
import { POST as print } from "@/app/api/hotel/sessions/[id]/print/route";

export async function POST(req: NextRequest) {
  try {
    const { actions } = await req.json();
    if (!Array.isArray(actions)) {
      return NextResponse.json({ error: "Invalid actions array" }, { status: 400 });
    }

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const remappedIds: Record<string, string> = {};
    const processedIds: string[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const action of actions) {
      try {
        // Apply remapped IDs to URL and body
        let urlStr = action.url;
        let bodyObj = action.body || {};
        let bodyStr = JSON.stringify(bodyObj);

        for (const [oldId, newId] of Object.entries(remappedIds)) {
          if (urlStr.includes(oldId)) {
            urlStr = urlStr.replace(oldId, newId);
          }
          if (bodyStr.includes(oldId)) {
            bodyStr = bodyStr.replace(new RegExp(oldId, 'g'), newId);
          }
        }
        
        // Re-parse body just in case the route handler expects it
        if (action.body) {
          bodyObj = JSON.parse(bodyStr);
        }

        const urlObj = new URL(urlStr, baseUrl);
        const path = urlObj.pathname;

        const subReq = new NextRequest(urlObj.href, {
          method: action.method,
          headers: req.headers, // Passes along cookies and auth headers natively
          body: ["POST", "PUT", "PATCH"].includes(action.method) ? bodyStr : null
        });

        let res: NextResponse | Response | null = null;

        if (path === "/api/hotel/sessions") {
          res = await createSession(subReq);
        } else {
          const matchItems = path.match(/^\/api\/hotel\/sessions\/([^\/]+)\/items$/);
          if (matchItems) res = await addItems(subReq, { params: Promise.resolve({ id: matchItems[1] }) });
          
          const matchCheckout = path.match(/^\/api\/hotel\/sessions\/([^\/]+)\/checkout$/);
          if (matchCheckout) res = await checkout(subReq, { params: Promise.resolve({ id: matchCheckout[1] }) });
          
          const matchPay = path.match(/^\/api\/hotel\/sessions\/([^\/]+)\/pay$/);
          if (matchPay) res = await pay(subReq, { params: Promise.resolve({ id: matchPay[1] }) });
          
          const matchPrint = path.match(/^\/api\/hotel\/sessions\/([^\/]+)\/print$/);
          if (matchPrint) res = await print(subReq, { params: Promise.resolve({ id: matchPrint[1] }) });
          
          const matchCoupon = path.match(/^\/api\/hotel\/sessions\/([^\/]+)\/apply-coupon$/);
          if (matchCoupon) res = await applyCoupon(subReq, { params: Promise.resolve({ id: matchCoupon[1] }) });
        }

        if (res) {
          if (res.status >= 500) {
            // Server error on this action. Stop processing to maintain chronological order.
            console.error(`[Bulk Sync] Server error ${res.status} on ${path}. Stopping batch.`);
            break;
          }

          if (res.status < 400) {
            // Success!
            processedIds.push(action.id);

            // ID remapping for offline-created sessions
            if (path === "/api/hotel/sessions" && bodyObj.offlineId) {
              try {
                // Must clone response because we might need to read it again, though we don't here
                const data = await res.clone().json();
                if (data?.id && data.id !== bodyObj.offlineId) {
                  remappedIds[bodyObj.offlineId] = data.id;
                }
              } catch (e) {}
            }
          } else {
            // 4xx client error (e.g. session already paid, validation error, conflict)
            // Safe to discard this action to prevent blocking the queue forever.
            processedIds.push(action.id);
            errors.push({ id: action.id, error: `Client error ${res.status}` });
          }
        } else {
           // Unknown route? Discard to prevent blocking.
           processedIds.push(action.id);
        }

      } catch (e) {
        console.error("[Bulk Sync] Internal error on action", action.id, e);
        break; // Stop processing to maintain order
      }
    }

    return NextResponse.json({
      processedIds,
      remappedIds,
      errors
    });
  } catch (e: any) {
    console.error("[Bulk Sync] Fatal error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
