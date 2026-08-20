import { get, set, update } from "idb-keyval";

export interface OfflineAction {
  id: string;
  url: string;
  method: string;
  body?: any;
  timestamp: number;
}

const QUEUE_KEY = "offline_queue";

export async function addOfflineAction(action: Omit<OfflineAction, "id" | "timestamp">) {
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
}

export async function removeOfflineAction(id: string) {
  await update(QUEUE_KEY, (val: any) => {
    const queue = Array.isArray(val) ? val : [];
    return queue.filter((action: OfflineAction) => action.id !== id);
  });
}

let _isSyncing = false;
export function isSyncingOfflineQueue() { return _isSyncing; }

export async function syncOfflineQueue(onProgress?: (remaining: number) => void) {
  if (_isSyncing) return;
  if (typeof navigator === "undefined" || !navigator.onLine) return;

  _isSyncing = true;
  try {
    let queue = await getOfflineQueue();
    
    while (queue.length > 0) {
      if (!navigator.onLine) break;
      queue.sort((a, b) => a.timestamp - b.timestamp);
      
      let processedAny = false;

      for (const action of queue) {
        if (!navigator.onLine) break;
        try {
          const response = await fetch(action.url, {
            method: action.method,
            headers: action.body ? { "Content-Type": "application/json" } : undefined,
            body: action.body ? JSON.stringify(action.body) : undefined,
          });
          const status = response.status;
          
          if (response.ok || status === 409 || status === 404 || (status >= 400 && status < 500)) {
            // If this was a session creation, check if the server returned a DIFFERENT ID than our offlineId
            if (response.ok && action.url.endsWith("/api/hotel/sessions") && action.method === "POST" && action.body?.offlineId) {
              try {
                const data = await response.clone().json();
                if (data && data.id && data.id !== action.body.offlineId) {
                  const oldId = action.body.offlineId;
                  const newId = data.id;
                  
                  // Update indexedDB queue
                  await update(QUEUE_KEY, (val: any) => {
                    const arr = Array.isArray(val) ? val : [];
                    return arr.map((item: OfflineAction) => {
                      if (item.url.includes(oldId)) {
                        return { ...item, url: item.url.replace(oldId, newId) };
                      }
                      return item;
                    });
                  });
                  
                  // Update in-memory queue for the current loop
                  for (let i = 0; i < queue.length; i++) {
                    if (queue[i].url.includes(oldId)) {
                      queue[i].url = queue[i].url.replace(oldId, newId);
                    }
                  }
                }
              } catch (e) {
                console.error("[OfflineSync] Failed to remap session ID", e);
              }
            }
            
            await removeOfflineAction(action.id);
            processedAny = true;
          }
          
          const remaining = (await getOfflineQueue()).length;
          onProgress?.(remaining);
        } catch (err) {
          console.error("[OfflineSync] Network error during sync:", err);
          break; // Stop processing current queue on network error
        }
      }

      if (!processedAny) break; // If no items were successfully processed, break to avoid infinite loop
      queue = await getOfflineQueue(); // Re-fetch to see if new items were added while we were syncing
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
  const isOnline = typeof navigator !== "undefined" && navigator.onLine;
  
  // To preserve chronological order, if there are already pending actions in the queue,
  // we must queue this action too, rather than bypassing them.
  const queue = await getOfflineQueue();
  const hasPending = queue.length > 0;

  if (isOnline && !hasPending) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (_err) {
      console.warn("[OfflineSync] Fetch failed, queueing:", url);
    }
  }

  let bodyData: any = undefined;
  if (options.body && typeof options.body === "string") {
    try { bodyData = JSON.parse(options.body); } catch (_e) { bodyData = options.body; }
  }

  await addOfflineAction({ url, method: options.method || "GET", body: bodyData });
  
  if (isOnline && !_isSyncing) {
    // Fire and forget to start draining the queue immediately
    syncOfflineQueue().catch(console.error);
  }
  
  return { ok: true, offline: true };
}
