import { createAdminClient } from "@/lib/supabase/admin";
import { formatINR, formatDateTime } from "@/lib/utils";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/bill/print-button";
import UpiQr from "@/components/bill/upi-qr";
import type { Hotel, RestaurantTable, SessionItem, TableSession } from "@/lib/types";
import QRCode from "qrcode";

export default async function BillPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const sb = createAdminClient();

  const { data: session } = await sb
    .from("table_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle<TableSession>();

  if (!session) notFound();

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
  const sessionItems = (items || []) as SessionItem[];

  let qrCodeUrl = "";
  if (hotel?.upi_id) {
    const upiLink = `upi://pay?pa=${hotel.upi_id}&pn=${encodeURIComponent(
      hotel.name
    )}&am=${Number(session.total).toFixed(2)}&cu=INR&tn=Table%20${session.table_number}`;

    try {
      qrCodeUrl = await QRCode.toDataURL(upiLink, {
        width: 256,
        margin: 1,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
    } catch (err) {
      console.error("Error generating UPI QR Code on server:", err);
    }
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
          {sessionItems.map((item) => (
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
      </div>

      {hotel?.upi_id && (
        <div className="mt-6">
          <UpiQr
            upiId={hotel.upi_id}
            hotelName={hotel.name}
            amount={Number(session.total)}
            tableNumber={session.table_number ?? 0}
            initialQrCodeUrl={qrCodeUrl}
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
