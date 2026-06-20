"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, QrCode as QrIcon } from "lucide-react";

interface UpiQrProps {
  upiId: string;
  hotelName: string;
  amount: number;
  tableNumber: number;
  initialQrCodeUrl?: string;
}

export default function UpiQr({ upiId, hotelName, amount, tableNumber, initialQrCodeUrl = "" }: UpiQrProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState(initialQrCodeUrl);
  const [copied, setCopied] = useState(false);

  const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
    hotelName
  )}&am=${amount.toFixed(2)}&cu=INR&tn=Table%20${tableNumber}`;

  useEffect(() => {
    if (initialQrCodeUrl) {
      setQrCodeUrl(initialQrCodeUrl);
      return;
    }
    QRCode.toDataURL(upiLink, {
      width: 256,
      margin: 1,
      color: {
        dark: "#0f172a", // slate-900
        light: "#ffffff",
      },
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("Error generating UPI QR Code:", err));
  }, [upiLink, initialQrCodeUrl]);

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
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 max-w-sm mx-auto shadow-sm">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm tracking-wide uppercase">
          <QrIcon size={16} className="text-brand-600" />
          <span>Pay via UPI App</span>
        </div>

        {qrCodeUrl ? (
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCodeUrl} alt="UPI Payment QR Code" className="h-44 w-44 object-contain" />
          </div>
        ) : (
          <div className="h-44 w-44 bg-white border rounded-xl flex items-center justify-center">
            <div className="animate-pulse h-8 w-8 rounded-full border-2 border-slate-200 border-t-brand-600"></div>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Scan to pay exact amount: <span className="font-extrabold text-slate-900">₹{amount.toFixed(2)}</span></p>
          <p className="text-[10px] text-gray-400 font-semibold truncate max-w-[280px]">UPI ID: {upiId}</p>
        </div>

        <button
          onClick={handleCopyLink}
          className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-slate-100 text-slate-700 font-bold py-2 px-4 rounded-xl border border-slate-300 text-xs transition active:scale-[0.98] shadow-sm"
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
      {qrCodeUrl && (
        <div className="print-only-flex flex-col items-center text-center mt-4 border-t border-dashed border-slate-300 pt-4">
          <p className="text-[10px] uppercase font-bold tracking-wider mb-2">Scan to Pay via UPI</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={qrCodeUrl} 
            alt="UPI Payment QR Code" 
            className="h-32 w-32 object-contain mx-auto" 
            style={{ width: "128px", height: "128px" }}
          />
          <p className="text-[9px] text-gray-700 mt-2 font-bold font-mono">UPI ID: {upiId}</p>
        </div>
      )}
    </>
  );
}
