"use client";

import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    // Initial state
    setIsOnline(navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
      setShowRestored(true);
      setTimeout(() => setShowRestored(false), 3000);
    }

    function handleOffline() {
      setIsOnline(false);
      setShowRestored(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline && !showRestored) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div 
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg border font-bold text-sm tracking-wide transition-colors ${
          !isOnline 
            ? "bg-red-500 border-red-600 text-white shadow-red-500/20"
            : "bg-emerald-500 border-emerald-600 text-white shadow-emerald-500/20"
        }`}
      >
        {!isOnline ? (
          <>
            <WifiOff size={16} className="animate-pulse" />
            Working Offline
          </>
        ) : (
          <>
            <Wifi size={16} />
            Connection Restored
          </>
        )}
      </div>
    </div>
  );
}
