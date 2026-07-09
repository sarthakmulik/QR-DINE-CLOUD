import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTableSignature } from "@/lib/crypto";
import { sendStaffPushSequential, sendStaffPush } from "@/lib/push";
import { revalidateTag } from "next/cache";

const lastWaiterCalls = new Map<string, number>();

// Cleanup helper for expired table call keys
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of lastWaiterCalls.entries()) {
      if (now - timestamp > 60000) {
        lastWaiterCalls.delete(key);
      }
    }
  }, 60000);
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ hotelId: string }> }
) {
  try {
    const { hotelId } = await props.params;
    const body = await req.json();
    const { tableNumber, signature } = body;

    const parsedTableNum = parseInt(tableNumber);
    if (isNaN(parsedTableNum) || parsedTableNum < 1) {
      return NextResponse.json({ error: "Invalid table number." }, { status: 400 });
    }

    // Enforce 30-second cooldown per table to block spammed waiter calls
    const callKey = `${hotelId}:${parsedTableNum}`;
    const lastCall = lastWaiterCalls.get(callKey);
    if (lastCall && Date.now() - lastCall < 30000) {
      const secondsLeft = Math.ceil((30000 - (Date.now() - lastCall)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${secondsLeft} seconds before calling the waiter again.` },
        { status: 429 }
      );
    }
    lastWaiterCalls.set(callKey, Date.now());

    const sb = createAdminClient();

    // 1. Verify plan access and secure_qr configuration
    const { data: hotel } = await sb
      .from("hotels")
      .select("plan, secure_qr")
      .eq("id", hotelId)
      .single();

    if (!hotel) {
      return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
    }

    // Cryptographic Anti-Tampering Check
    if (hotel.secure_qr && !verifyTableSignature(hotelId, parsedTableNum, signature)) {
      return NextResponse.json({ error: "invalid_qr" }, { status: 403 });
    }

    const planLower = hotel.plan.toLowerCase();
    if (planLower === "basic") {
      return NextResponse.json(
        { error: "Call Waiter service is not enabled on this plan." },
        { status: 403 }
      );
    }

    // 2. Insert waiter request
    const { data: request, error } = await sb
      .from("waiter_requests")
      .insert({
        hotel_id: hotelId,
        table_number: parsedTableNum,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;

    // MUST await this so serverless environments (Vercel) don't kill the Firebase JWT handshake!
    const assignedStaffId = await sendStaffPushSequential(hotelId, {
      title: `🔔 Table ${parsedTableNum} — Waiter Needed!`,
      body: `Table ${parsedTableNum} is calling for assistance.`,
      tag: `waiter-${hotelId}-${parsedTableNum}`,
      url: "/staff",
      channelId: "waiter_alerts"
    });

    if (assignedStaffId) {
      await sb.from("waiter_requests").update({ assigned_staff_id: assignedStaffId }).eq("id", request.id);
      request.assigned_staff_id = assignedStaffId;
    }

    // Background Escalation Matrix
    // Because Next.js `next start` is a persistent Node process, we can safely use setTimeout.
    const requestId = request.id;
    
    // Level 1 Escalation: 3 Minutes (Broadcast to all waiters)
    setTimeout(async () => {
      try {
        const checkSb = createAdminClient();
        const { data: check } = await checkSb.from("waiter_requests").select("status").eq("id", requestId).single();
        if (check && check.status === "pending") {
          // Unassign the request so anyone can take it
          await checkSb.from("waiter_requests").update({ assigned_staff_id: null }).eq("id", requestId);
          
          sendStaffPush(hotelId, {
            title: `⚠️ ESCALATION: Table ${parsedTableNum}`,
            body: `Table ${parsedTableNum} has been waiting for 3 minutes! Any waiter respond!`,
            tag: `waiter-${hotelId}-${parsedTableNum}`,
            url: "/staff",
            channelId: "waiter_alerts"
          });
        }
      } catch (e) {
        // silent fail for background task
      }
    }, 3 * 60 * 1000);

    // Level 2 Escalation: 5 Minutes (Critical Broadcast)
    setTimeout(async () => {
      try {
        const checkSb = createAdminClient();
        const { data: check } = await checkSb.from("waiter_requests").select("status").eq("id", requestId).single();
        if (check && check.status === "pending") {
          sendStaffPush(hotelId, {
            title: `🚨 CRITICAL: Table ${parsedTableNum}`,
            body: `Table ${parsedTableNum} has been ignored for 5 minutes!`,
            tag: `waiter-${hotelId}-${parsedTableNum}`,
            url: "/staff",
            channelId: "waiter_alerts"
          });
        }
      } catch (e) {
        // silent fail for background task
      }
    }, 5 * 60 * 1000);

    revalidateTag(`staff-overview-${hotelId}`);

    return NextResponse.json(request);
  } catch (err: any) {
    console.error("Error calling waiter:", err);
    return NextResponse.json({ error: "Server error calling waiter." }, { status: 500 });
  }
}
