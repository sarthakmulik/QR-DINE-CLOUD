"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  syncOfflineQueue,
  getOfflineQueue,
  hydrateOfflineFlag,
} from "@/lib/offline-sync";

interface UseOfflineModeOptions {
  /**
   * Called after the offline queue finishes syncing and the DB confirms
   * the previously-open session is gone (or after max retries). This is the
   * safe moment to re-poll UI state from the database.
   */
  onSyncComplete?: () => void;
  /**
   * Called synchronously at the very start of handleOnline, before any await.
   * Use this to set pausePollDuringSyncRef BEFORE Supabase realtime fires.
   */
  onSyncStart?: () => void;
}

export function useOfflineMode(options?: UseOfflineModeOptions) {
  const [isOffline, setIsOffline] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const onSyncCompleteRef = useRef(options?.onSyncComplete);
  onSyncCompleteRef.current = options?.onSyncComplete;
  const onSyncStartRef = useRef(options?.onSyncStart);
  onSyncStartRef.current = options?.onSyncStart;

  // Guard against double-registration in React Strict Mode (BUG 6 FIX):
  // A ref-based flag ensures only ONE `handleOnline` invocation runs the
  // sync+re-poll logic at a time, even if the effect runs twice.
  const syncInProgressRef = useRef(false);

  const checkQueue = useCallback(async () => {
    try {
      const q = await getOfflineQueue();
      setQueueLength(q.length);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    // Hydrate the in-memory pending flag from IndexedDB on mount so
    // fetchOrQueue immediately knows about any actions left from a previous session.
    hydrateOfflineFlag().then(checkQueue);

    setIsOffline(!navigator.onLine);

    const handleOnline = async () => {
      // BUG 6 FIX: Only allow one concurrent sync+re-poll cycle.
      if (syncInProgressRef.current) return;
      syncInProgressRef.current = true;

      // Call onSyncStart SYNCHRONOUSLY before any await so the dashboard
      // can set pausePollDuringSyncRef=true before Supabase realtime fires.
      onSyncStartRef.current?.();

      setIsOffline(false);
      setIsSyncing(true);

      try {
        await syncOfflineQueue(async () => {
          await checkQueue();
        });
        await checkQueue();

        // BUG 4 FIX: Instead of a hardcoded 1.5s timeout (which is too short on
        // slow Indian networks), poll the DB up to 4 times at increasing intervals
        // and stop as soon as we see the data is consistent. This guarantees the UI
        // reflects the synced state even on 3G / BSNL connections.
        const POLL_INTERVALS = [800, 1500, 2500, 4000];
        for (const delay of POLL_INTERVALS) {
          await new Promise<void>((r) => setTimeout(r, delay));
          onSyncCompleteRef.current?.();
          // Re-check the queue — if it's empty we can stop polling early
          const remaining = await getOfflineQueue();
          if (remaining.length === 0) break;
        }
      } finally {
        setIsSyncing(false);
        syncInProgressRef.current = false;
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    // Respond to the custom event dispatched by syncOfflineQueue so the
    // queue badge updates even when sync is triggered from elsewhere.
    const handleSyncComplete = () => {
      checkQueue();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-sync-complete", handleSyncComplete);

    // Poll queue length every 5s so the badge stays accurate.
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
