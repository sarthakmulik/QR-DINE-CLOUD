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

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOffline, queueLength: 0, isSyncing: false, refreshQueue: async () => {} };
}
