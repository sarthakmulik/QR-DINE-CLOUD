import { get, set, update } from "idb-keyval";

export interface OfflineAction {
  id: string;
  url: string;
  method: string;
  body?: any;
  timestamp: number;
}

const QUEUE_KEY = "offline_queue";

/**
 * In-memory flag that mirrors whether IndexedDB has pending actions.
 * Updated synchronously on every add/remove so `fetchOrQueue` never has
 * to do an async DB read to decide whether to queue or fire directly.
 * This eliminates the race window described in Bug 1.
 */
let _hasPendingActions = false;
let _hydrated = false;

export async function addOfflineAction(action: Omit<OfflineAction, "id" | "timestamp">) {
  _hasPendingActions = true; // Set synchronously immediately to prevent races
  const newAction: OfflineAction = {
    ...action,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  await update(QUEUE_KEY, (val: any) => {
    const queue = Array.isArray(val) ? val : [];
    return [...queue, newAction];
  });
}

export async function getOfflineQueue(): Promise<OfflineAction[]> {
  const queue = await get(QUEUE_KEY);
  return Array.isArray(queue) ? queue : [];
}

export async function clearOfflineQueue() {
  await set(QUEUE_KEY, []);
  _hasPendingActions = false;
}

export async function removeOfflineAction(id: string) {
  await update(QUEUE_KEY, (val: any) => {
    const queue = Array.isArray(val) ? val : [];
    const next = queue.filter((action: OfflineAction) => action.id !== id);
    _hasPendingActions = next.length > 0;
    return next;
  });
}

/** Hydrate the in-memory flag from IndexedDB on app startup */
export async function hydrateOfflineFlag() {
  const queue = await getOfflineQueue();
  _hasPendingActions = queue.length > 0;
  _hydrated = true;
}

let _isSyncing = false;
export function isSyncingOfflineQueue() { return _isSyncing; }

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function syncOfflineQueue(onProgress?: (remaining: number) => void) {
  if (_isSyncing) return;
  if (typeof navigator === "undefined" || !navigator.onLine) return;

  _isSyncing = true;
  try {
    let queue = await getOfflineQueue();
    _hasPendingActions = queue.length > 0;

    while (queue.length > 0) {
      if (!navigator.onLine) break;
      queue.sort((a, b) => a.timestamp - b.timestamp);

      let processedAny = false;

      for (const action of queue) {
        if (!navigator.onLine) break;

        let retries = 0;
        let succeeded = false;

        while (retries <= MAX_RETRIES) {
          try {
            const response = await fetch(action.url, {
              method: action.method,
              headers: action.body ? { "Content-Type": "application/json" } : undefined,
              body: action.body ? JSON.stringify(action.body) : undefined,
            });
            const status = response.status;

            if (response.ok) {
              // --- Session ID remapping for offline-created sessions ---
              // If the server returned a DIFFERENT ID than our offline-generated UUID
              // (e.g. the table already had an open session), rewrite all subsequent
              // queue URLs so they point at the correct real session ID.
              if (
                action.url.endsWith("/api/hotel/sessions") &&
                action.method === "POST" &&
                action.body?.offlineId
              ) {
                try {
                  const data = await response.clone().json();
                  if (data?.id && data.id !== action.body.offlineId) {
                    const oldId = action.body.offlineId as string;
                    const newId = data.id as string;

                    // Rewrite IndexedDB
                    await update(QUEUE_KEY, (val: any) => {
                      const arr = Array.isArray(val) ? val : [];
                      return arr.map((item: OfflineAction) =>
                        item.url.includes(oldId)
                          ? { ...item, url: item.url.replace(oldId, newId) }
                          : item
                      );
                    });

                    // Rewrite in-memory queue for the current loop iteration
                    for (let i = 0; i < queue.length; i++) {
                      if (queue[i].url.includes(oldId)) {
                        queue[i] = { ...queue[i], url: queue[i].url.replace(oldId, newId) };
                      }
                    }
                  }
                } catch (e) {
                  console.error("[OfflineSync] Failed to remap session ID:", e);
                }
              }

              await removeOfflineAction(action.id);
              processedAny = true;
              succeeded = true;
              break;
            }

            // 4xx errors are client errors that will NEVER succeed on retry — discard permanently.
            // 409 Conflict = already processed (idempotent operation), safe to discard.
            if (status >= 400 && status < 500) {
              console.warn(`[OfflineSync] Client error ${status} for ${action.url} — discarding action.`);
              await removeOfflineAction(action.id);
              processedAny = true;
              succeeded = true;
              break;
            }

            // 5xx = server error (cold start, Supabase down, etc.) — retry with backoff.
            if (status >= 500) {
              retries++;
              if (retries > MAX_RETRIES) {
                console.error(`[OfflineSync] Server error ${status} after ${MAX_RETRIES} retries for ${action.url} — will retry on next sync.`);
                break; // Leave it in queue, will be tried next time internet reconnects
              }
              console.warn(`[OfflineSync] Server error ${status}, retrying ${retries}/${MAX_RETRIES} in ${RETRY_DELAY_MS * retries}ms...`);
              await sleep(RETRY_DELAY_MS * retries);
              continue;
            }

            // Unknown response — break out and retry later
            break;
          } catch (err) {
            // Network-level error (no response at all)
            console.error("[OfflineSync] Network error during sync:", err);
            retries++;
            if (retries > MAX_RETRIES) {
              break; // Leave in queue
            }
            await sleep(RETRY_DELAY_MS * retries);
          }
        }

        if (!succeeded && !navigator.onLine) break;
      }

      const remaining = (await getOfflineQueue()).length;
      onProgress?.(remaining);

      if (!processedAny) break; // Nothing was processed — avoid infinite loop
      queue = await getOfflineQueue(); // Re-fetch to catch any new actions added during sync
    }
  } finally {
    _isSyncing = false;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("offline-sync-complete"));
    }
  }
}

export async function fetchOrQueue(
  url: string,
  options: RequestInit = {}
): Promise<Response | { ok: true; offline: true }> {
  if (!_hydrated) await hydrateOfflineFlag();
  
  const isOnline = typeof navigator !== "undefined" && navigator.onLine;

  // Use the in-memory flag (synchronous — no async DB read) to decide ordering.
  // If there are pending actions in the queue, we MUST queue this too to preserve
  // chronological order (Bug 1 fix). This prevents new requests from racing ahead
  // of a still-running background sync.
  if (isOnline && !_hasPendingActions && !_isSyncing) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (_err) {
      console.warn("[OfflineSync] Fetch failed online, falling back to queue:", url);
      // Fall through to queue it
    }
  }

  let bodyData: any = undefined;
  if (options.body && typeof options.body === "string") {
    try { bodyData = JSON.parse(options.body); } catch (_e) { bodyData = options.body; }
  }

  await addOfflineAction({ url, method: options.method || "GET", body: bodyData });

  // If we're online but had pending items (or just went offline), kick off sync
  if (isOnline && !_isSyncing) {
    syncOfflineQueue().catch(console.error);
  }

  return { ok: true, offline: true };
}
