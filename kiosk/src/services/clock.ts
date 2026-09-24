// Clock-in/out orchestration: fingerprint match -> local rule check -> signed event ->
// send immediately, or queue when offline. No manual input is ever required.
import { scanner } from '../native/scanner';
import { ApiError, NetworkError, sendClockEvents, signClockEvent } from './api';
import { enqueue, flushQueue, pendingCount } from './queue';
import { localDate, RosterEmployee, store } from './store';

export class ClockError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface ClockOutcome {
  employee: RosterEmployee;
  eventType: 'in' | 'out';
  capturedAt: string;
  wasLate: boolean | null; // null when saved offline (server decides later)
  synced: boolean;
}

const MIN_GAP_MS = 60_000;
const MAX_SHIFT_SPAN_MS = 20 * 3_600_000;

/** Same sequencing rules as the clock-event function, applied locally so offline scans are validated too. */
async function assertSequence(employeeId: string, eventType: 'in' | 'out', nowMs: number) {
  const last = (await store.getLastEvents())[employeeId];
  const lastMs = last ? Date.parse(last.captured_at) : 0;
  if (last && nowMs - lastMs < MIN_GAP_MS) throw new ClockError('TOO_SOON');
  if (eventType === 'in' && last?.event_type === 'in' && last.work_date === localDate(nowMs)) {
    throw new ClockError('ALREADY_IN');
  }
  if (eventType === 'out' && (!last || last.event_type !== 'in' || nowMs - lastMs > MAX_SHIFT_SPAN_MS)) {
    throw new ClockError('NOT_IN');
  }
  return last;
}

export async function clock(eventType: 'in' | 'out'): Promise<ClockOutcome> {
  const deviceId = await store.getDeviceId();
  if (!deviceId) throw new ClockError('DEVICE_NOT_REGISTERED');

  const match = await scanner.identify(); // rejects with NO_MATCH / TIMEOUT / ...
  const employee = (await store.getRoster()).find((e) => e.id === match.employeeId);
  if (!employee) throw new ClockError('INACTIVE_EMPLOYEE');

  const nowMs = Date.now() + (await store.getClockOffset());
  const last = await assertSequence(employee.id, eventType, nowMs);
  const capturedAt = new Date(nowMs).toISOString();
  const event = await signClockEvent(deviceId, employee.id, eventType, capturedAt, match.score);
  const workDate = eventType === 'in' ? localDate(nowMs) : last!.work_date;
  const remember = () => store.setLastEvent(employee.id, { event_type: eventType, captured_at: capturedAt, work_date: workDate });

  // Send live only when nothing older is waiting, so the server always sees events in order.
  if ((await pendingCount()) === 0) {
    try {
      const [result] = await sendClockEvents(deviceId, [event]);
      if (result.status === 'rejected') throw new ClockError(result.reason);
      await remember();
      const wasLate = result.status === 'accepted' ? result.event.was_late : null;
      return { employee, eventType, capturedAt, wasLate, synced: true };
    } catch (e) {
      const retryable = e instanceof NetworkError || (e instanceof ApiError && e.status >= 500);
      if (!retryable) throw e;
    }
  }

  await enqueue(event);
  await remember();
  flushQueue(deviceId);
  return { employee, eventType, capturedAt, wasLate: null, synced: false };
}
