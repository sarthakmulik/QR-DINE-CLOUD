"use client";

import { useState, useEffect, useCallback } from "react";
import { syncOfflineQueue, getOfflineQueue } from "@/lib/offline-sync";

export function useOfflineMode() {
  const [isOffline, setIsOffline] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Check queue length periodically
  const checkQueue = useCallback(async () => {
    try {
      const q = await getOfflineQueue();
      setQueueLength(q.length);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    // Initial check
    setIsOffline(!navigator.onLine);
    checkQueue();

    const handleOnline = async () => {
      setIsOffline(false);
      setIsSyncing(true);
      await syncOfflineQueue();
      await checkQueue();
      setIsSyncing(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Also poll queue length every 5 seconds just to update UI if actions are added
    const interval = setInterval(checkQueue, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkQueue]);

  return { isOffline, queueLength, isSyncing, refreshQueue: checkQueue };
}
