import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Hotel,
  RestaurantTable,
  SessionItem,
  SessionStatus,
  TableSession,
} from "@/lib/types";
import { mapTableSession } from "@/lib/types";

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
  const { data: sessionData, error } = await sb
    .from("table_sessions")
    .select("*, session_items(*)")
    .eq("id", sessionId)
    .single();

  if (error || !sessionData) throw new Error("Session not found");
  const items = (sessionData.session_items || []) as SessionItem[];

  let hotel: Hotel | null = hotelData ?? null;
  if (!hotel) {
    const { data: fetchedHotel } = await sb
      .from("hotels")
      .select("*")
      .eq("id", sessionData.hotel_id)
      .single<Hotel>();
    hotel = fetchedHotel;
  }

  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const discountPercent = Number(sessionData.discount_percent || 0);
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = hotel ? Number(hotel.tax_rate) ?? 5 : 5;
  const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

  const { data: updated, error: updateErr } = await sb
    .from("table_sessions")
    .update({ subtotal, discount_amount: discountAmount, tax_amount: taxAmount, total })
    .eq("id", sessionId)
    .select("*")
    .single<TableSession>();

  if (updateErr || !updated) throw new Error(updateErr?.message || "Failed to update session");
  return mapTableSession(updated, items);
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

export async function getOrCreateOpenSession(hotelId: string, tableNumber: number, expectedSessionId?: string | null) {
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
    await sb.from("table_sessions").update({ customer_count: currentSession.customer_count + 1 }).eq("id", currentSession.id);
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
      .insert({ hotel_id: hotelId, table_id: table.id, table_number: tableNumber, status: "open", customer_count: 1 })
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
  preVerifiedSession?: TableSession | null
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

  const { error } = await sb.from("session_items").insert({
    session_id: sessionId,
    menu_item_id: item.menuItemId || null,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
  });
  if (error) throw new Error(error.message);
  return recalculateSessionTotals(sessionId, hotel);
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

  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const discountPercent = Number(session.discount_percent || 0);
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = hotel ? Number(hotel.tax_rate) ?? 5 : 5;
  const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

  const { data: updated, error: updateErr } = await sb
    .from("table_sessions")
    .update({ status: "checkout_initiated", subtotal, discount_amount: discountAmount, tax_amount: taxAmount, total })
    .eq("id", sessionId).select("*").single<TableSession>();
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

  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const discountPercent = Number(sessionData.discount_percent || 0);
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = hotel ? Number(hotel.tax_rate) ?? 5 : 5;
  const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

  const { data: updated, error: updateErr } = await admin()
    .from("table_sessions")
    .update({ status: "bill_printed", subtotal, discount_amount: discountAmount, tax_amount: taxAmount, total })
    .eq("id", sessionId).select("*").single<TableSession>();
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

  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const discountPercent = Number(session.discount_percent || 0);
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = hotel ? Number(hotel.tax_rate) ?? 5 : 5;
  const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;
  const now = new Date().toISOString();

  const [updateSessionRes] = await Promise.all([
    sb.from("table_sessions")
      .update({ status: "closed", payment_method: paymentMethod, closed_at: now, end_time: now, subtotal, discount_amount: discountAmount, tax_amount: taxAmount, total })
      .eq("id", sessionId).select("*").single<TableSession>(),
    sb.from("restaurant_tables").update({ current_session_id: null }).eq("id", session.table_id),
  ]);

  const closed = updateSessionRes.data;
  if (updateSessionRes.error || !closed) throw new Error(updateSessionRes.error?.message || "Failed to close session");
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
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const discountPercent = Number(sessionData.discount_percent || 0);
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxRate = hotel ? Number(hotel.tax_rate) ?? 5 : 5;
  const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
  const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

  // We explicitly DO NOT assign order_number here to prevent "ghost" orders from skipping numbers.
  // order_number will be assigned later when payment is successfully confirmed.

  const { data: updated, error: updateErr } = await sb
    .from("table_sessions")
    .update({ 
      status: "payment_pending", 
      payment_method: paymentMethod,
      subtotal, 
      discount_amount: discountAmount, 
      tax_amount: taxAmount, 
      total 
    })
    .eq("id", sessionId).select("*").single<TableSession>();
    
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
