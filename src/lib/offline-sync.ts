import { get, set, update } from 'idb-keyval';

export interface OfflineAction {
  id: string;
  url: string;
  method: string;
  body?: any;
  timestamp: number;
}

const QUEUE_KEY = 'offline_queue';

export async function addOfflineAction(action: Omit<OfflineAction, 'id' | 'timestamp'>) {
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

let isSyncing = false;

export async function syncOfflineQueue() {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  isSyncing = true;
  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) {
      isSyncing = false;
      return;
    }

    // Sort by timestamp just in case
    queue.sort((a, b) => a.timestamp - b.timestamp);

    for (const action of queue) {
      // Check online status before each request
      if (!navigator.onLine) break;

      try {
        const response = await fetch(action.url, {
          method: action.method,
          headers: action.body ? { 'Content-Type': 'application/json' } : undefined,
          body: action.body ? JSON.stringify(action.body) : undefined,
        });

        if (response.ok || response.status >= 400) {
          // If successful OR it failed with 4xx/5xx (meaning the server responded but rejected it),
          // we should remove it from the queue so we don't get stuck forever.
          await removeOfflineAction(action.id);
        }
      } catch (err) {
        // Network error (fetch failed entirely)
        console.error('Failed to sync offline action:', err);
        break; // Stop syncing, wait for connection again
      }
    }
  } finally {
    isSyncing = false;
  }
}

export async function fetchOrQueue(url: string, options: RequestInit = {}): Promise<Response | { ok: true, offline: true }> {
  if (navigator.onLine) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      // Network failed despite navigator.onLine saying true
      console.warn('Fetch failed, queueing offline', err);
    }
  }

  // Queue it offline
  let bodyData: any = undefined;
  if (options.body && typeof options.body === 'string') {
    try {
      bodyData = JSON.parse(options.body);
    } catch (e) {
      // Not JSON
    }
  }

  await addOfflineAction({
    url,
    method: options.method || 'GET',
    body: bodyData,
  });

  return { ok: true, offline: true };
}
