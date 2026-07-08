import { createAdminClient } from "@/lib/supabase/admin";
import { formatINR, formatDateTime } from "@/lib/utils";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/bill/print-button";
import UpiQr from "@/components/bill/upi-qr";
import type { Hotel, RestaurantTable, SessionItem, TableSession } from "@/lib/types";

import { getAuthUser } from "@/lib/auth";

export default async function BillPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { sessionId } = await params;
  const sp = searchParams ? await searchParams : {};
  const isView = sp.view === "1";

  const sb = createAdminClient();

  const { data: session } = await sb
    .from("table_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle<TableSession>();

  if (!session) notFound();

  if (isView) {
    const user = await getAuthUser();
    if (!user || (user.role !== "superadmin" && user.hotelId !== session.hotel_id)) {
      notFound();
    }
  }

  const { data: items } = await sb
    .from("session_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("added_at", { ascending: true });

  const { data: hotel } = await sb
    .from("hotels")
    .select("*")
    .eq("id", session.hotel_id)
    .single<Hotel>();

  const { data: table } = await sb
    .from("restaurant_tables")
    .select("*")
    .eq("id", session.table_id)
    .single<RestaurantTable>();

  const taxRate = hotel?.tax_rate !== undefined && hotel?.tax_rate !== null ? Number(hotel.tax_rate) : 5;
  const cgst = taxRate / 2;
  const sgst = taxRate / 2;
  const rawSessionItems = (items || []) as SessionItem[];

  const groupedItems = Object.values(
    rawSessionItems.reduce((acc, item) => {
      const key = `${item.menu_item_id}-${item.price}`;
      if (!acc[key]) {
        acc[key] = { ...item };
      } else {
        acc[key].quantity += item.quantity;
      }
      return acc;
    }, {} as Record<string, SessionItem>)
  );

  if (hotel?.upi_id) {
    // We rely on the client to generate the QR code dynamically
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-8 max-w-lg mx-auto receipt-print-layout">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>

      <div className="text-center border-b border-dashed border-slate-300 dark:border-zinc-700 pb-4 mb-4">
        {hotel?.logo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hotel.logo}
              alt=""
              className="w-16 h-16 mx-auto rounded-full object-cover mb-2"
            />
          </>
        )}
        <h1 className="text-xl font-bold">{hotel?.name}</h1>
        {hotel?.address && (
          <p className="text-sm text-gray-600 mt-1">{hotel.address}</p>
        )}
        {hotel?.gst_number && (
          <p className="text-sm text-gray-600">GSTIN: {hotel.gst_number}</p>
        )}
        <p className="text-sm font-medium mt-2">
          TAX INVOICE — {table?.label || `Table ${session.table_number}`}
        </p>
        <p className="text-xs text-gray-500">
          {formatDateTime(session.start_time)}
        </p>
      </div>

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="border-b border-dashed border-slate-300 dark:border-zinc-700">
            <th className="text-left py-2">Item</th>
            <th className="text-center py-2">Qty</th>
            <th className="text-right py-2">Rate</th>
            <th className="text-right py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {groupedItems.map((item) => (
            <tr key={item.id} className="border-b border-dashed border-slate-200 dark:border-zinc-800">
              <td className="py-2">{item.name}</td>
              <td className="text-center py-2">{item.quantity}</td>
              <td className="text-right py-2">{formatINR(Number(item.price))}</td>
              <td className="text-right py-2">
                {formatINR(Number(item.price) * item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-dashed border-slate-300 dark:border-zinc-700 pt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatINR(Number(session.subtotal))}</span>
        </div>
        {Number(session.discount_amount) > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Discount{session.coupon_code ? ` (${session.coupon_code})` : ""}</span>
            <span>-{formatINR(Number(session.discount_amount))}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-600">
          <span>CGST @ {cgst}%</span>
          <span>{formatINR(Number(session.tax_amount) / 2)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>SGST @ {sgst}%</span>
          <span>{formatINR(Number(session.tax_amount) / 2)}</span>
        </div>
        <div className="flex justify-between font-bold text-lg pt-2 border-t border-dashed border-slate-300 dark:border-zinc-700">
          <span>Grand Total</span>
          <span>{formatINR(Number(session.total))}</span>
        </div>
        {session.payment_method && (
          <div className="mt-4 pt-2 border-t border-slate-200 dark:border-zinc-800 text-center font-bold tracking-widest text-xs">
            PAID — {session.payment_method.toUpperCase()}
          </div>
        )}
      </div>

      {hotel?.upi_id && (
        <div className="mt-6">
          <UpiQr
            upiId={hotel.upi_id}
            hotelName={hotel.name}
            amount={Number(session.total)}
            tableNumber={session.table_number ?? 0}
            logo={hotel.logo || undefined}
          />
        </div>
      )}

      <div className="text-center mt-8 pt-4 border-t border-dashed border-slate-300 dark:border-zinc-700 text-gray-500 text-sm">
        <p>Thank you for dining with us!</p>
        <p className="mt-1">Please visit again 🙏</p>
      </div>
    </div>
  );
}
