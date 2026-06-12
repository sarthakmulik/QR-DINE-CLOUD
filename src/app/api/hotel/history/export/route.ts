import { NextRequest, NextResponse } from "next/server";
import { requireHotelAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapTableSession } from "@/lib/types";
import type { SessionItem, TableSession } from "@/lib/types";

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  try {
    const { hotelId, hotelPlan } = await requireHotelAccess();
    const sb = createAdminClient();

    // Verify plan access
    const plan = hotelPlan?.toLowerCase() || "basic";
    if (plan === "basic") {
      return NextResponse.json(
        { error: "CSV Export is only available on Pro or Elite plans." },
        { status: 403 }
      );
    }

    let query = sb
      .from("table_sessions")
      .select(`
        *,
        session_items (*),
        restaurant_tables!table_sessions_table_id_fkey (label, table_number)
      `)
      .eq("hotel_id", hotelId)
      .eq("status", "closed")
      .order("closed_at", { ascending: false });

    // Enforce Pro plan limit (last 30 days)
    if (plan === "pro") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query = query.gte("closed_at", thirtyDaysAgo.toISOString());
    }

    // Safe ceiling for exports
    query = query.limit(5000);

    const { data: sessions, error } = await query;
    if (error) throw error;

    const result = ((sessions || []) as any[]).map((session) => {
      const items = (session.session_items || []) as SessionItem[];
      const table = session.restaurant_tables;
      return {
        ...mapTableSession(session as TableSession, items),
        table: table
          ? { label: table.label, tableNumber: table.table_number }
          : undefined,
      };
    });

    const headers = [
      "Session ID",
      "Table",
      "Subtotal (INR)",
      "Discount (INR)",
      "Tax (INR)",
      "Total (INR)",
      "Payment Method",
      "Closed At",
      "Items",
    ];

    const csvRows = [headers.join(",")];

    for (const s of result) {
      const itemsStr = s.items
        .map((item: any) => `${item.quantity}x ${item.name}`)
        .join("; ");

      const row = [
        s.id,
        s.table?.label || `Table ${s.tableNumber}`,
        s.subtotal,
        s.discountAmount,
        s.taxAmount,
        s.total,
        s.paymentMethod || "—",
        s.closedAt ? new Date(s.closedAt).toLocaleString("en-IN") : "—",
        itemsStr,
      ];

      csvRows.push(row.map(escapeCSV).join(","));
    }

    const csvContent = csvRows.join("\r\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="order_history_${plan}.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unauthorized" },
      { status: 500 }
    );
  }
}
