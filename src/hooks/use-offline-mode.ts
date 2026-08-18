"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { syncOfflineQueue, getOfflineQueue } from "@/lib/offline-sync";

interface UseOfflineModeOptions {
  /** Called ~1.5s after the offline queue finishes syncing — safe moment to re-poll from DB */
  onSyncComplete?: () => void;
}

export function useOfflineMode(options?: UseOfflineModeOptions) {
  const [isOffline, setIsOffline] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const onSyncCompleteRef = useRef(options?.onSyncComplete);
  onSyncCompleteRef.current = options?.onSyncComplete;

  const checkQueue = useCallback(async () => {
    try {
      const q = await getOfflineQueue();
      setQueueLength(q.length);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    checkQueue();

    const handleOnline = async () => {
      setIsOffline(false);
      setIsSyncing(true);
      await syncOfflineQueue(async () => {
        await checkQueue();
      });
      await checkQueue();
      setIsSyncing(false);
      // Give the server 1.5s to finish writes, then trigger a re-poll
      setTimeout(() => {
        onSyncCompleteRef.current?.();
      }, 1500);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    // Also respond to the custom event dispatched by syncOfflineQueue
    const handleSyncComplete = () => {
      checkQueue();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-sync-complete", handleSyncComplete);

    // Poll queue length every 5s so the badge stays accurate
    const interval = setInterval(checkQueue, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-sync-complete", handleSyncComplete);
      clearInterval(interval);
    };
  }, [checkQueue]);

  return { isOffline, queueLength, isSyncing, refreshQueue: checkQueue };
}
