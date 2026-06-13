import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDineUrl } from "@/lib/utils";
import { getTableSignature } from "@/lib/crypto";
import { getTableStatus } from "@/lib/session-service";
import type { RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import { mapTableSession } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { hotelId } = await requireHotelAccess();
    const sb = createAdminClient();

    const [tablesRes, sessionsRes] = await Promise.all([
      sb
        .from("restaurant_tables")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("table_number", { ascending: true }),
      sb
        .from("table_sessions")
        .select("*")
        .eq("hotel_id", hotelId)
        .neq("status", "closed"),
    ]);

    const tables = (tablesRes.data || []) as RestaurantTable[];
    const sessions = (sessionsRes.data || []) as TableSession[];
    const activeSessionIds = sessions.map((s) => s.id);

    let items: SessionItem[] = [];
    if (activeSessionIds.length > 0) {
      const { data: itemsRes } = await sb
        .from("session_items")
        .select("*")
        .in("session_id", activeSessionIds)
        .order("added_at", { ascending: true });
      items = (itemsRes || []) as SessionItem[];
    }

    const itemsBySessionId: Record<string, SessionItem[]> = {};
    for (const item of items) {
      if (!itemsBySessionId[item.session_id]) {
        itemsBySessionId[item.session_id] = [];
      }
      itemsBySessionId[item.session_id].push(item);
    }

    const sessionsMap: Record<string, TableSession> = {};
    for (const session of sessions) {
      sessionsMap[session.id] = session;
    }

    const enriched = tables.map((table) => {
      let currentSession = null;

      if (table.current_session_id) {
        const session = sessionsMap[table.current_session_id];
        if (session) {
          const sessionItems = itemsBySessionId[session.id] || [];
          currentSession = mapTableSession(session, sessionItems);
        }
      }

      const baseDineUrl = getDineUrl(table.hotel_id, table.table_number);
      const signature = getTableSignature(table.hotel_id, table.table_number);
      const dineUrl = `${baseDineUrl}?sign=${signature}`;

      return {
        id: table.id,
        hotelId: table.hotel_id,
        tableNumber: table.table_number,
        label: table.label,
        qrCodeUrl: table.qr_code_url,
        dineUrl,
        currentSessionId: table.current_session_id,
        currentSession,
        status: getTableStatus(currentSession),
      };
    });

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hotelId, hotelPlan } = await requireHotelAccess();
    const body = await req.json();
    const tableNumber = parseInt(body.tableNumber);
    const label = body.label || `Table ${tableNumber}`;

    const baseDineUrl = getDineUrl(hotelId, tableNumber);
    const signature = getTableSignature(hotelId, tableNumber);
    const dineUrl = `${baseDineUrl}?sign=${signature}`;
    const qrCodeDataUrl = await QRCode.toDataURL(dineUrl, {
      width: 300,
      margin: 2,
    });

    const sb = createAdminClient();

    // Enforce plan limits (no extra DB query needed)
    if (!hotelPlan) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 });
    }

    const plan = hotelPlan.toLowerCase();
    const maxTables = plan === "basic" ? 5 : plan === "pro" ? 20 : Infinity;

    if (maxTables !== Infinity) {
      const { count, error: countError } = await sb
        .from("restaurant_tables")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotelId);

      if (countError) throw countError;

      if ((count || 0) >= maxTables) {
        return NextResponse.json(
          { error: `Table limit reached. You can only create up to ${maxTables} tables on the ${hotelPlan} plan.` },
          { status: 403 }
        );
      }
    }

    const { data: table, error } = await sb
      .from("restaurant_tables")
      .insert({
        hotel_id: hotelId,
        table_number: tableNumber,
        label,
        qr_code_url: qrCodeDataUrl,
      })
      .select("*")
      .single<RestaurantTable>();

    if (error) {
      return NextResponse.json(
        { error: "Failed to create table. Table number may already exist." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      id: table!.id,
      hotelId: table!.hotel_id,
      tableNumber: table!.table_number,
      label: table!.label,
      qrCodeUrl: table!.qr_code_url,
      dineUrl,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create table" }, { status: 400 });
  }
}
