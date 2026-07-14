import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Hotel,
  RestaurantTable,
  SessionItem,
  SessionStatus,
  TableSession,
} from "@/lib/types";
import { mapTableSession } from "@/lib/types";
import { sendWhatsappBill } from "./whatsapp-service";

function admin() {
  return createAdminClient();
}

async function getSessionItems(sessionId: string) {
  const { data } = await admin()
    .from("session_items")
    .select("id, session_id, menu_item_id, name, price, quantity, added_at")
    .eq("session_id", sessionId)
    .order("added_at", { ascending: true });
  return (data || []) as SessionItem[];
}

export async function recalculateSessionTotals(
  sessionId: string,
  hotelData?: Hotel | null
) {
  const sb = admin();
  let hotel: Hotel | null = hotelData ?? null;

  let retries = 0;
  while (retries < 5) {
    const { data: sessionData, error } = await sb
      .from("table_sessions")
      .select("*, session_items(*)")
      .eq("id", sessionId)
      .single();

    if (error || !sessionData) throw new Error("Session not found");
    const items = (sessionData.session_items || []) as SessionItem[];

    if (!hotel) {
      const { data: fetchedHotel } = await sb
        .from("hotels")
        .select("*")
        .eq("id", sessionData.hotel_id)
        .single<Hotel>();
      hotel = fetchedHotel;
    }

    const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    let discountPercent = Number(sessionData.discount_percent || 0);
    let couponCode = sessionData.coupon_code;

    if (couponCode) {
      const { data: coupon } = await sb
        .from("coupons")
        .select("min_bill, is_active")
        .eq("hotel_id", sessionData.hotel_id)
        .eq("code", couponCode)
        .maybeSingle();

      if (!coupon || !coupon.is_active || subtotal < Number(coupon.min_bill)) {
        // Coupon invalid or min_bill no longer met (e.g. item removed)
        discountPercent = 0;
        couponCode = null;
      }
    }

    const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxRate = hotel ? Number(hotel.tax_rate) ?? 5 : 5;
    const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
    const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

    const { data: updated, error: updateErr } = await sb
      .from("table_sessions")
      .update({ 
        subtotal, 
        discount_percent: discountPercent,
        coupon_code: couponCode,
        discount_amount: discountAmount, 
        tax_amount: taxAmount, 
        total 
      })
      .eq("id", sessionId)
      .eq("subtotal", sessionData.subtotal) // OCC Lock: Ensure no concurrent lost updates
      .select("*")
      .maybeSingle();

    if (updated) {
      return mapTableSession(updated as TableSession, items);
    }
    
    // Concurrency collision detected, retry...
    retries++;
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
  }

  throw new Error("Failed to recalculate session totals due to high concurrency. Please try again.");
}

async function loadTableWithSession(hotelId: string, tableNumber: number) {
  const sb = admin();
  let { data: table } = await sb
    .from("restaurant_tables")
    .select("id, hotel_id, table_number, label, qr_code_url, current_session_id")
    .eq("hotel_id", hotelId)
    .eq("table_number", tableNumber)
    .maybeSingle<RestaurantTable>();

  if (!table) {
    const { data: created, error } = await sb
      .from("restaurant_tables")
      .insert({ hotel_id: hotelId, table_number: tableNumber, label: `Table ${tableNumber}` })
      .select("*")
      .single<RestaurantTable>();
    if (error || !created) throw new Error("Failed to create table");
    table = created;
  }

  let currentSession: (TableSession & { items: SessionItem[] }) | null = null;
  if (table.current_session_id) {
    const { data: session } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", table.current_session_id)
      .maybeSingle<TableSession>();
    if (session) {
      const items = await getSessionItems(session.id);
      currentSession = { ...session, items };
    }
  }
  return { table, currentSession };
}

export async function getOrCreateOpenSession(hotelId: string, tableNumber: number, expectedSessionId?: string | null, customerName?: string | null, customerPhone?: string | null) {
  const sb = admin();
  const [hotelRes, tableData] = await Promise.all([
    sb.from("hotels").select("*").eq("id", hotelId).single<Hotel>(),
    loadTableWithSession(hotelId, tableNumber),
  ]);

  const hotel = hotelRes.data;
  if (!hotel) throw new Error("Hotel not found");
  const { table, currentSession } = tableData;

  if (expectedSessionId && (!currentSession || currentSession.id !== expectedSessionId)) {
    return { error: "session_closed" as const, hotel, table };
  }

  if (currentSession && currentSession.status !== "closed") {
    if (currentSession.status === "checkout_initiated" || currentSession.status === "bill_printed") {
      return { error: "checkout" as const, session: mapTableSession(currentSession, currentSession.items), hotel, table };
    }
    // Update existing session with customer info if it wasn't provided yet
    const updates: any = { customer_count: currentSession.customer_count + 1 };
    if (customerName && !currentSession.customer_name) updates.customer_name = customerName;
    if (customerPhone && !currentSession.customer_phone) updates.customer_phone = customerPhone;
    
    await sb.from("table_sessions").update(updates).eq("id", currentSession.id);
    
    if (updates.customer_name) currentSession.customer_name = customerName;
    if (updates.customer_phone) currentSession.customer_phone = customerPhone;
    
    return { session: mapTableSession(currentSession, currentSession.items), hotel, table, created: false };
  }

  if (hotel.status === "paused" || hotel.status === "suspended") {
    return { error: "paused" as const, hotel };
  }

  let retries = 0;
  while (retries < 3) {
    const { data: existingOpen } = await sb
      .from("table_sessions")
      .select("id, status")
      .eq("hotel_id", hotelId)
      .eq("table_number", tableNumber)
      .eq("status", "open")
      .maybeSingle();

    if (existingOpen) {
      const [itemsArr, fullSessionRes] = await Promise.all([
        getSessionItems(existingOpen.id),
        sb.from("table_sessions").select("*").eq("id", existingOpen.id).single<TableSession>(),
      ]);
      if (fullSessionRes.data) {
        return { session: mapTableSession(fullSessionRes.data, itemsArr), hotel, table, created: false };
      }
    }

    const { data: newSession, error: sessionError } = await sb
      .from("table_sessions")
      .insert({ 
        hotel_id: hotelId, 
        table_id: table.id, 
        table_number: tableNumber, 
        status: "open", 
        customer_count: 1,
        customer_name: customerName || null,
        customer_phone: customerPhone || null
      })
      .select("*")
      .single<TableSession>();

    if (newSession) {
      sb.from("restaurant_tables").update({ current_session_id: newSession.id }).eq("id", table.id).then(() => {});
      return { session: mapTableSession(newSession, []), hotel, table, created: true };
    }

    if (sessionError?.code === "23505") {
      retries++;
      await new Promise((r) => setTimeout(r, 100 * retries));
      continue;
    }
    throw new Error("Failed to create session");
  }
  throw new Error("Failed to create session after retries");
}

export async function addItemToSession(
  sessionId: string,
  item: { menuItemId?: string; name: string; price: number; quantity: number },
  preVerifiedSession?: TableSession | null,
  skipRecalculate: boolean = false
) {
  const sb = admin();
  let session: TableSession;
  let hotel: Hotel | null = null;

  if (preVerifiedSession) {
    session = preVerifiedSession;
    const { data: hotelData } = await sb.from("hotels").select("*").eq("id", session.hotel_id).single<Hotel>();
    hotel = hotelData;
  } else {
    const { data: sessionData } = await sb.from("table_sessions").select("*, hotels(*)").eq("id", sessionId).single();
    if (!sessionData) throw new Error("Session not found");
    session = sessionData as TableSession;
    hotel = (sessionData as any).hotels as Hotel | null;
  }

  if (session.status !== "open" && session.status !== "draft") throw new Error("SESSION_NOT_OPEN");

  // Smart Kitchen Batching (Debounce Engine)
  // Check if the exact same item was added to this session within the last 60 seconds
  // and is still in a mutable state ("pending" or "preparing").
  let merged = false;
  if (item.menuItemId) {
    const { data: existingItems } = await sb
      .from("session_items")
      .select("id, quantity, added_at, status")
      .eq("session_id", sessionId)
      .eq("menu_item_id", item.menuItemId)
      .in("status", ["pending", "preparing"])
      .order("added_at", { ascending: false })
      .limit(1);

    if (existingItems && existingItems.length > 0) {
      const existing = existingItems[0];
      const addedTime = new Date(existing.added_at).getTime();
      const now = Date.now();
      
      // 60-second merge window
      if (now - addedTime <= 60000) {
        const newQuantity = Math.min(999, existing.quantity + item.quantity);
        const { error: updateErr } = await sb
          .from("session_items")
          .update({ 
            quantity: newQuantity,
            added_at: new Date().toISOString() // Refresh timestamp so the debounce window rolls forward
          })
          .eq("id", existing.id);
          
        if (updateErr) throw new Error(updateErr.message);
        merged = true;
      }
    }
  }

  // Fallback: If not merged, create a new row
  if (!merged) {
    const { error } = await sb.from("session_items").insert({
      session_id: sessionId,
      menu_item_id: item.menuItemId || null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    });
    if (error) throw new Error(error.message);
  }
  
  if (skipRecalculate) return null;
  return recalculateSessionTotals(sessionId, hotel);
}

export async function removeItemFromSession(sessionId: string, itemId: string, hotelId: string) {
  const sb = admin();
  const { data: sessionData, error: sessionErr } = await sb
    .from("table_sessions")
    .select("*, hotels(*)")
    .eq("id", sessionId)
    .eq("hotel_id", hotelId)
    .single();

  if (sessionErr || !sessionData) throw new Error("Session not found");
  
  const session = sessionData as TableSession;
  if (session.status === "closed") throw new Error("Cannot modify closed session");
  
  const { error } = await sb.from("session_items").delete().eq("id", itemId).eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  
  return recalculateSessionTotals(sessionId, (sessionData as any).hotels as Hotel);
}

export async function initiateCheckout(sessionId: string, preVerifiedSession?: TableSession | null) {
  const sb = admin();
  let session: TableSession;
  let hotel: Hotel | null = null;
  let table: RestaurantTable | null = null;
  let items: SessionItem[] = [];

  if (preVerifiedSession) {
    session = preVerifiedSession;
    const [hotelRes, tableRes, itemsArr] = await Promise.all([
      sb.from("hotels").select("*").eq("id", session.hotel_id).single<Hotel>(),
      sb.from("restaurant_tables").select("*").eq("id", session.table_id).single<RestaurantTable>(),
      getSessionItems(sessionId),
    ]);
    hotel = hotelRes.data;
    table = tableRes.data;
    items = itemsArr;
  } else {
    const { data: sessionData, error } = await sb
      .from("table_sessions")
      .select(`*, hotels (*), restaurant_tables!table_sessions_table_id_fkey (*), session_items (*)`)
      .eq("id", sessionId).single();
    if (error || !sessionData) throw new Error("Session not found");
    session = sessionData as TableSession;
    items = (sessionData.session_items || []) as SessionItem[];
    hotel = (sessionData as any).hotels as Hotel | null;
    table = (sessionData as any).restaurant_tables as RestaurantTable | null;
  }

  if (session.status !== "open") throw new Error("Session is not open for checkout");

  const { data: updated, error: updateErr } = await sb
    .from("table_sessions")
    .update({ 
      status: "checkout_initiated",
      checkout_initiated_at: new Date().toISOString()
    })
    .eq("id", sessionId)
    .eq("status", "open")
    .select("*").single<TableSession>();
  if (updateErr || !updated) throw new Error(updateErr?.message || "Failed to update session");
  return mapTableSession(updated, items, hotel || undefined, table || undefined);
}

export async function printBill(sessionId: string) {
  const { data: sessionData, error } = await admin()
    .from("table_sessions")
    .select(`*, hotels (*), restaurant_tables!table_sessions_table_id_fkey (*), session_items (*)`)
    .eq("id", sessionId).single();

  if (error || !sessionData) throw new Error("Session not found");
  // Allow printing from open, checkout_initiated, or bill_printed — only block closed sessions
  if (sessionData.status === "closed") {
    throw new Error("Cannot print bill for a closed session.");
  }

  const items = (sessionData.session_items || []) as SessionItem[];
  const hotel = (sessionData as any).hotels as Hotel | null;
  const table = (sessionData as any).restaurant_tables as RestaurantTable | null;

  const { data: updated, error: updateErr } = await admin()
    .from("table_sessions")
    .update({ status: "bill_printed" })
    .eq("id", sessionId)
    .select("*").single<TableSession>();
  if (updateErr || !updated) throw new Error(updateErr?.message || "Failed to update session");
  return mapTableSession(updated, items, hotel || undefined, table || undefined);
}

export async function markAsPaid(
  sessionId: string,
  paymentMethod: "Cash" | "UPI" | "Card",
  preVerifiedSession?: TableSession | null
) {
  const sb = admin();
  let session: TableSession;
  let hotel: Hotel | null = null;
  let table: RestaurantTable | null = null;
  let items: SessionItem[] = [];

  if (preVerifiedSession) {
    session = preVerifiedSession;
    const [hotelRes, tableRes, itemsArr] = await Promise.all([
      sb.from("hotels").select("*").eq("id", session.hotel_id).single<Hotel>(),
      sb.from("restaurant_tables").select("*").eq("id", session.table_id).single<RestaurantTable>(),
      getSessionItems(sessionId),
    ]);
    hotel = hotelRes.data;
    table = tableRes.data;
    items = itemsArr;
  } else {
    const { data: sessionData, error } = await sb
      .from("table_sessions")
      .select(`*, hotels (*), restaurant_tables!table_sessions_table_id_fkey (*), session_items (*)`)
      .eq("id", sessionId).single();
    if (error || !sessionData) throw new Error("Session not found");
    session = sessionData as TableSession;
    items = (sessionData.session_items || []) as SessionItem[];
    hotel = (sessionData as any).hotels as Hotel | null;
    table = (sessionData as any).restaurant_tables as RestaurantTable | null;
  }

  const now = new Date().toISOString();

  const [updateSessionRes] = await Promise.all([
    sb.from("table_sessions")
      .update({ status: "closed", payment_method: paymentMethod, closed_at: now, end_time: now })
      .eq("id", sessionId).select("*").single<TableSession>(),
    sb.from("restaurant_tables").update({ current_session_id: null }).eq("id", session.table_id),
  ]);

  const closed = updateSessionRes.data;
  if (updateSessionRes.error || !closed) throw new Error(updateSessionRes.error?.message || "Failed to close session");

  // Asynchronously send WhatsApp bill if enabled and phone number exists
  if (hotel?.whatsapp_bill_enabled && session.customer_phone) {
    sendWhatsappBill(session.customer_phone, closed, items, hotel).catch((err) => {
      console.error("Failed to send background WhatsApp bill:", err);
    });
  }

  return mapTableSession(closed, items, hotel || undefined, table || undefined);
}

export function getTableStatus(
  currentSession: { status: SessionStatus } | null | undefined
): "free" | "occupied" | "checkout" {
  if (!currentSession) return "free";
  if (currentSession.status === "open") return "occupied";
  if (currentSession.status === "checkout_initiated" || currentSession.status === "bill_printed") return "checkout";
  return "free";
}

export async function autoCleanupSessions(hotelId: string) {
  const sb = admin();
  const now = Date.now();
  const fiveMinsAgo = new Date(now - 5 * 60 * 1000).toISOString();
  // 2. Auto-cancel unpaid QS orders abandoned for 10 minutes.
  // start_time is reset when the customer initiates checkout (confirmQuickServiceOrder),
  // so this strictly means 10 minutes from the time they clicked "Pay Online".
  const tenMinsAgo = new Date(now - 10 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

  // 1. Auto-collect ready orders forgotten for 5 mins
  await sb.from("table_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("hotel_id", hotelId)
    .eq("status", "ready_for_pickup")
    .lt("start_time", fiveMinsAgo);

  // 2. Auto-cancel unpaid QS orders abandoned for 10 mins
  await sb.from("table_sessions")
    .update({ status: "cancelled", closed_at: new Date().toISOString() })
    .eq("hotel_id", hotelId)
    .eq("status", "payment_pending")
    .lt("start_time", tenMinsAgo);
    
  // 3. Auto-discard stale drafts that were never submitted
  await sb.from("table_sessions")
    .update({ status: "cancelled", closed_at: new Date().toISOString() })
    .eq("hotel_id", hotelId)
    .eq("status", "draft")
    .lt("start_time", twoHoursAgo);
}

export async function getOrCreateQuickServiceSession(hotelId: string, expectedSessionId?: string | null) {
  const sb = admin();
  const hotelRes = await sb.from("hotels").select("*").eq("id", hotelId).single<Hotel>();
  const hotel = hotelRes.data;
  if (!hotel) throw new Error("Hotel not found");

  if (hotel.status === "paused" || hotel.status === "suspended") {
    return { error: "paused" as const, hotel };
  }

  if (expectedSessionId) {
    const { data: currentSession } = await sb
      .from("table_sessions")
      .select("*")
      .eq("id", expectedSessionId)
      .maybeSingle<TableSession>();

    if (currentSession) {
      if (currentSession.status === "closed" || currentSession.status === "ready_for_pickup") {
        return { error: "session_closed" as const, hotel };
      }
      const items = await getSessionItems(currentSession.id);
      return { session: mapTableSession(currentSession, items), hotel, created: false };
    }
  }

  // Create new draft session
  const { data: newSession, error: sessionError } = await sb
    .from("table_sessions")
    .insert({ hotel_id: hotelId, status: "draft", customer_count: 1 })
    .select("*")
    .single<TableSession>();

  if (!newSession) throw new Error(sessionError?.message || "Failed to create quick service session");
  return { session: mapTableSession(newSession, []), hotel, created: true };
}

export async function confirmQuickServiceOrder(sessionId: string, paymentMethod: "Cash" | "UPI" | "Card") {
  const sb = admin();
  const { data: sessionData, error } = await sb.from("table_sessions").select("*, hotels(*)").eq("id", sessionId).single();
  if (error || !sessionData) throw new Error("Session not found");
  
  if (sessionData.status !== "draft") throw new Error("Session is not in draft status");

  const hotel = (sessionData as any).hotels as Hotel;
  const items = await getSessionItems(sessionId);

  // We explicitly DO NOT assign order_number here to prevent "ghost" orders from skipping numbers.
  // order_number will be assigned later when payment is successfully confirmed.

  // Reset start_time so the 10-minute auto-cancel window starts from checkout time
  const { data: updated, error: updateErr } = await sb
    .from("table_sessions")
    .update({ 
      status: "payment_pending", 
      payment_method: paymentMethod, 
      start_time: new Date().toISOString()
    })
    .eq("id", sessionId)
    .eq("status", "draft")
    .select("*").single<TableSession>();
    
  if (updateErr || !updated) throw new Error(updateErr?.message || "Failed to confirm order");
  return mapTableSession(updated, items, hotel);
}

export async function assignOrderNumber(sessionId: string) {
  const sb = admin();
  
  // Get session details to find hotel_id and check if it already has an order_number
  const { data: session, error } = await sb.from("table_sessions").select("hotel_id, order_number").eq("id", sessionId).single();
  if (error || !session) throw new Error("Session not found");
  
  if (session.order_number !== null) {
    // Already has an order number, do nothing
    return session.order_number;
  }
  
  // Call the RPC to get the daily order number
  const { data: orderNumber, error: rpcError } = await sb.rpc("generate_daily_order_number", { p_hotel_id: session.hotel_id });
  if (rpcError || orderNumber === null) throw new Error("Failed to generate order number: " + rpcError?.message);
  
  // Try to assign it only if it's still null (prevents race condition overwrites)
  const { data: updated, error: updateErr } = await sb
    .from("table_sessions")
    .update({ order_number: orderNumber })
    .eq("id", sessionId)
    .is("order_number", null)
    .select("order_number")
    .maybeSingle();
    
  if (updateErr) throw new Error("Failed to assign order number");
  
  if (!updated) {
    // Another request beat us to it and set the order number!
    // Fetch the existing order number and return it.
    const { data: existing } = await sb.from("table_sessions").select("order_number").eq("id", sessionId).single();
    if (existing && existing.order_number !== null) {
      return existing.order_number;
    }
  }
  
  return orderNumber;
}
