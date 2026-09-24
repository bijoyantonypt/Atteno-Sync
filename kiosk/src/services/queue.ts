// Offline queue: signed clock events are stored locally and sent in capture order.
// The server de-duplicates by nonce, so re-sending after a timeout is always safe.
import { NetworkError, sendClockEvents } from './api';
import { SignedEvent, store } from './store';

let flushing: Promise<void> | null = null;

export async function enqueue(event: SignedEvent): Promise<void> {
  const queue = await store.getQueue();
  queue.push(event);
  await store.setQueue(queue);
}

export async function pendingCount(): Promise<number> {
  return (await store.getQueue()).length;
}

/** Sends all queued events. Never throws; failures keep events queued for the next attempt. */
export function flushQueue(deviceId: string): Promise<void> {
  flushing ??= (async () => {
    try {
      const queue = await store.getQueue();
      if (queue.length === 0) return;
      const results = await sendClockEvents(deviceId, queue.slice(0, 200));
      // accepted / duplicate / rejected are all final answers from the server
      const settled = new Set(results.map((r) => r.nonce));
      for (const r of results) {
        if (r.status === 'rejected') console.warn(`Queued event ${r.nonce} rejected: ${r.reason}`);
      }
      const remaining = (await store.getQueue()).filter((e) => !settled.has(e.nonce));
      await store.setQueue(remaining);
    } catch (e) {
      if (!(e instanceof NetworkError)) console.warn('Queue flush failed', e);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
