"use client";

import { useState } from "react";
import { Check, Copy, QrCode as QrIcon } from "lucide-react";
import DynamicQRCode from "@/components/dashboard/DynamicQRCode";

interface UpiQrProps {
  upiId: string;
  hotelName: string;
  amount: number;
  tableNumber: number;
}

export default function UpiQr({ upiId, hotelName, amount, tableNumber }: UpiQrProps) {
  const [copied, setCopied] = useState(false);

  const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
    hotelName
  )}&am=${amount.toFixed(2)}&cu=INR&tn=Table%20${tableNumber}`;

  const handleCopyLink = async () => {
    try {
      const safeUpiLink = upiLink.replace(/[\r\n\x00-\x1F\x7F]/g, "");
      await navigator.clipboard.writeText(safeUpiLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy UPI link:", err);
    }
  };

  return (
    <>
      <div className="bg-slate-50 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 max-w-sm mx-auto shadow-sm">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm tracking-wide uppercase">
          <QrIcon size={16} className="text-brand-600" />
          <span>Pay via UPI App</span>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-slate-200 dark:border-zinc-700/80 shadow-inner">
          <DynamicQRCode url={upiLink} width={176} height={176} />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">Scan to pay exact amount: <span className="font-extrabold text-slate-900 dark:text-white">₹{amount.toFixed(2)}</span></p>
          <p className="text-[10px] text-gray-400 font-semibold truncate max-w-[280px]">UPI ID: {upiId}</p>
        </div>

        <button
          onClick={handleCopyLink}
          className="w-full flex items-center justify-center space-x-2 bg-white dark:bg-zinc-800/50 hover:bg-slate-100 dark:hover:bg-white/[0.1] text-slate-700 dark:text-zinc-200 font-bold py-2 px-4 rounded-xl transition border border-slate-200 dark:border-zinc-700/80 text-xs transition active:scale-[0.98] shadow-sm"
        >
          {copied ? (
            <>
              <Check size={14} className="text-emerald-600" />
              <span className="text-emerald-600">Payment Link Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy UPI Payment Link</span>
            </>
          )}
        </button>
      </div>

      {/* Print-only clean UPI QR Code */}
      <div className="print-only-flex flex-col items-center text-center mt-4 border-t border-dashed border-slate-300 dark:border-zinc-700 pt-4">
        <p className="text-[10px] uppercase font-bold tracking-wider mb-2">Scan to Pay via UPI</p>
        <DynamicQRCode url={upiLink} width={128} height={128} className="mx-auto" />
        <p className="text-[9px] text-gray-700 mt-2 font-bold font-mono">UPI ID: {upiId}</p>
      </div>
    </>
  );
}
