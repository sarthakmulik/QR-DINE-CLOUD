"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Options {
  table: string;
  hotelId?: string | null;
  filterColumn?: string;
  filterValue?: string;
  onRefresh: (payload?: any) => void;
  enabled?: boolean;
}

/**
 * useRealtimeRefresh
 *
 * Subscribes to Supabase Realtime postgres_changes for a table and calls
 * onRefresh() on any INSERT/UPDATE/DELETE. We intentionally ignore the row
 * payload — all data-shaping stays in the existing fetch functions so we
 * don't duplicate or break any existing logic.
 *
 * Returns `connected: true` once the subscription is confirmed SUBSCRIBED.
 */
export function useRealtimeRefresh({
  table,
  hotelId,
  filterColumn,
  filterValue,
  onRefresh,
  enabled = true,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  // Keep a stable ref so the channel does not re-subscribe when the
  // caller's onRefresh callback identity changes between renders.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    // Build the postgres_changes row-level filter string
    let filterStr: string | undefined;
    if (filterColumn && filterValue) {
      filterStr = `${filterColumn}=eq.${filterValue}`;
    } else if (hotelId) {
      filterStr = `hotel_id=eq.${hotelId}`;
    }

    // Unique channel name prevents collisions if multiple hooks run at once
    const uid = Math.random().toString(36).slice(2, 8);
    const channelName = `rt-${table}-${uid}`;

    const channel = (supabase.channel(channelName) as any)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table,
        ...(filterStr ? { filter: filterStr } : {}),
      }, (payload: any) => {
        // Pass payload so consumers can conditionally filter global events
        onRefreshRef.current(payload);
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") setConnected(true);
        else if (status === "CLOSED" || status === "CHANNEL_ERROR") setConnected(false);
      });

    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [table, hotelId, filterColumn, filterValue, enabled]);

  return { connected };
}
