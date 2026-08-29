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

// In-memory queue mirrors IndexedDB for instant synchronous access.
// IndexedDB is written asynchronously in the background for crash recovery.
const _memQueue: OfflineAction[] = [];

export async function addOfflineAction(action: Omit<OfflineAction, "id" | "timestamp">) {
  _hasPendingActions = true; // Synchronous — no await needed for ordering decisions

  const newAction: OfflineAction = {
    ...action,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  // Add to in-memory queue SYNCHRONOUSLY — fetchOrQueue returns instantly
  _memQueue.push(newAction);

  // Persist to IndexedDB in the background (crash recovery) — non-blocking
  update(QUEUE_KEY, (val: any) => {
    const queue = Array.isArray(val) ? val : [];
    return [...queue, newAction];
  }).catch((e) => console.error("[OfflineSync] Failed to persist action to IDB:", e));
}

export async function getOfflineQueue(): Promise<OfflineAction[]> {
  // In-memory queue is always up-to-date during a session.
  // IDB is only read on startup (hydrateOfflineFlag) for crash recovery.
  return [..._memQueue];
}

export async function clearOfflineQueue() {
  _memQueue.length = 0; // clear in-memory
  _hasPendingActions = false;
  await set(QUEUE_KEY, []).catch(() => {});
}

export async function removeOfflineAction(id: string) {
  const idx = _memQueue.findIndex((a) => a.id === id);
  if (idx !== -1) _memQueue.splice(idx, 1);
  _hasPendingActions = _memQueue.length > 0;

  // Persist removal to IDB in background
  update(QUEUE_KEY, (val: any) => {
    const queue = Array.isArray(val) ? val : [];
    return queue.filter((a: OfflineAction) => a.id !== id);
  }).catch(() => {});
}

/** On startup: load any actions persisted from a previous crash into _memQueue */
export async function hydrateOfflineFlag() {
  if (_hydrated) return;
  try {
    const persisted = await get(QUEUE_KEY);
    if (Array.isArray(persisted) && persisted.length > 0) {
      // Merge: avoid duplicates if addOfflineAction was already called this session
      const existingIds = new Set(_memQueue.map((a) => a.id));
      for (const item of persisted) {
        if (!existingIds.has(item.id)) _memQueue.push(item);
      }
    }
  } catch (e) {
    console.error("[OfflineSync] Failed to hydrate from IDB:", e);
  }
  _hasPendingActions = _memQueue.length > 0;
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
    // Use in-memory queue — no IDB read needed (already up-to-date)
    let queue = [..._memQueue];
    _hasPendingActions = queue.length > 0;

    while (queue.length > 0) {
      if (!navigator.onLine) break;
      queue.sort((a, b) => a.timestamp - b.timestamp);

      let processedAny = false;

      // Group actions in chunks of 50 to prevent huge payloads and Vercel timeouts
      const CHUNK_SIZE = 50;
      for (let i = 0; i < queue.length; i += CHUNK_SIZE) {
        if (!navigator.onLine) break;

        const chunk = queue.slice(i, i + CHUNK_SIZE);
        let retries = 0;
        let chunkSucceeded = false;

        while (retries <= MAX_RETRIES) {
          try {
            const response = await fetch("/api/hotel/bulk-sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ actions: chunk }),
            });

            if (response.ok) {
              const result = await response.json();
              const { processedIds = [], remappedIds = {}, errors = [] } = result;

              // Remove successfully processed actions (and 4xx errors) from IndexedDB and memory
              for (const id of processedIds) {
                await removeOfflineAction(id);
              }

              // Apply ID remapping to remaining items in IDB and memory
              const remapEntries = Object.entries(remappedIds);
              if (remapEntries.length > 0) {
                await update(QUEUE_KEY, (val: any) => {
                  let arr = Array.isArray(val) ? val : [];
                  for (const [oldId, newId] of remapEntries) {
                    const strNewId = newId as string;
                    arr = arr.map((item: OfflineAction) => {
                      if (item.url.includes(oldId) || (item.body && JSON.stringify(item.body).includes(oldId))) {
                        let newUrl = item.url.replace(oldId, strNewId);
                        let newBody = item.body;
                        if (newBody) {
                          newBody = JSON.parse(JSON.stringify(newBody).replace(new RegExp(oldId, 'g'), strNewId));
                        }
                        return { ...item, url: newUrl, body: newBody };
                      }
                      return item;
                    });
                  }
                  return arr;
                });

                // Apply to remaining memQueue
                for (let j = 0; j < _memQueue.length; j++) {
                  for (const [oldId, newId] of remapEntries) {
                    const strNewId = newId as string;
                    if (_memQueue[j].url.includes(oldId) || (_memQueue[j].body && JSON.stringify(_memQueue[j].body).includes(oldId))) {
                      _memQueue[j].url = _memQueue[j].url.replace(oldId, strNewId);
                      if (_memQueue[j].body) {
                        _memQueue[j].body = JSON.parse(JSON.stringify(_memQueue[j].body).replace(new RegExp(oldId, 'g'), strNewId));
                      }
                    }
                  }
                }
              }

              if (processedIds.length > 0) {
                processedAny = true;
              }
              chunkSucceeded = true;
              break;
            }

            const status = response.status;
            if (status >= 500) {
              retries++;
              if (retries > MAX_RETRIES) {
                console.error(`[OfflineSync] Bulk sync server error ${status} after ${MAX_RETRIES} retries.`);
                break;
              }
              await sleep(RETRY_DELAY_MS * retries);
              continue;
            }

            // 4xx error on the bulk-sync endpoint itself (e.g. auth failed)
            console.error(`[OfflineSync] Bulk sync client error ${status}.`);
            break;

          } catch (err) {
            console.error("[OfflineSync] Network error during bulk sync:", err);
            retries++;
            if (retries > MAX_RETRIES) break;
            await sleep(RETRY_DELAY_MS * retries);
          }
        }

        if (!chunkSucceeded) {
          // If a chunk fails completely after retries, stop processing the queue to preserve order
          break;
        }
      }

      const remaining = _memQueue.length;
      onProgress?.(remaining);

      if (!processedAny) break; // Nothing was processed — avoid infinite loop
      queue = [..._memQueue]; // Re-snapshot in-memory queue to catch any new actions added during sync
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
