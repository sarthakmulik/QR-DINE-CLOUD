"use client";

import { useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function QrScanner({ onScan, onClose }: QrScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scannerRef.current.render(
      (decodedText) => {
        onScan(decodedText);
      },
      (error) => {
        // Ignore scan failures (happens every frame without a QR code)
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
      <div className="w-full max-w-md p-4">
        <h2 className="text-white text-center text-xl font-bold mb-4">Scan Clock-in QR Code</h2>
        <div id="reader" className="bg-white rounded-xl overflow-hidden" />
        <button
          onClick={onClose}
          className="mt-6 w-full py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
