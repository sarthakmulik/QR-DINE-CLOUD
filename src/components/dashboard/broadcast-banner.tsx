"use client";

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";

interface Broadcast {
  id: string;
  message: string;
  type: string;
}

export function BroadcastBanner() {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    async function fetchBroadcast() {
      try {
        const res = await fetch("/api/hotel/broadcasts");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            const isDismissed = localStorage.getItem(`dismissed_broadcast_${data.id}`);
            if (!isDismissed) {
              setBroadcast(data);
              setDismissed(false);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch broadcast", err);
      }
    }
    fetchBroadcast();
  }, []);

  function handleDismiss() {
    if (broadcast) {
      localStorage.setItem(`dismissed_broadcast_${broadcast.id}`, "true");
      setDismissed(true);
    }
  }

  if (dismissed || !broadcast) return null;

  const bgColors = {
    info: "bg-blue-600",
    warning: "bg-yellow-600",
    success: "bg-green-600",
    error: "bg-red-600",
  };

  const bgColor = bgColors[broadcast.type as keyof typeof bgColors] || bgColors.info;

  return (
    <div className={`${bgColor} text-white px-4 py-3 flex items-start sm:items-center justify-between shadow-md z-40 relative`}>
      <div className="flex items-start sm:items-center gap-3">
        <Megaphone className="w-5 h-5 shrink-0 mt-0.5 sm:mt-0" />
        <span className="text-sm font-medium">
          {broadcast.message}
        </span>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 ml-4 bg-white/20 hover:bg-white/30 transition-colors p-1.5 rounded-md"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
