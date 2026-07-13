"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface PairTabletModalProps {
  hotelId: string;
}

export function PairTabletModal({ hotelId }: PairTabletModalProps) {
  const [showPairModal, setShowPairModal] = useState(false);
  const [tabletQrUrl, setTabletQrUrl] = useState("");

  const openPairTabletModal = async () => {
    if (!hotelId) return;
    const kdsUrl = `${window.location.origin}/kitchen/${hotelId}`;
    try {
      const qrUrl = await QRCode.toDataURL(kdsUrl, { width: 300, margin: 2 });
      setTabletQrUrl(qrUrl);
      setShowPairModal(true);
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  };

  return (
    <>
      <button
        onClick={openPairTabletModal}
        className="inline-flex items-center gap-1.5 rounded-md font-medium transition px-3 py-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/20"
      >
        📱 Pair Tablet
      </button>

      <Modal
        open={showPairModal}
        onClose={() => setShowPairModal(false)}
        title="Pair Kitchen Tablet"
        className="max-w-md"
      >
        <div className="space-y-4 text-center">
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Scan this QR code with the tablet or mobile device you want to use as a Kitchen Display System (KDS).
          </p>
          {tabletQrUrl && (
            <div className="flex justify-center bg-white p-4 rounded-xl border border-gray-100 dark:border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tabletQrUrl} alt="Pair Tablet QR" className="w-48 h-48" />
            </div>
          )}
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-lg p-3 text-left">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <strong>Tip:</strong> Keep the device plugged in and set the screen timeout to &quot;Never&quot; for the best experience.
            </p>
          </div>
          <Button
            className="w-full"
            onClick={() => setShowPairModal(false)}
          >
            Done
          </Button>
        </div>
      </Modal>
    </>
  );
}
