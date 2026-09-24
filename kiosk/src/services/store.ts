// Local persistent state (AsyncStorage). Enables offline clock-in/out on the kiosk.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RosterEmployee {
  id: string;
  employee_code: string;
  full_name: string;
  full_name_hi: string | null;
  shift_code: string | null;
}

export interface LastEvent {
  event_type: 'in' | 'out';
  captured_at: string;
  work_date: string;
}

export interface SignedEvent {
  nonce: string;
  employee_id: string;
  event_type: 'in' | 'out';
  captured_at: string;
  match_score: number;
  signature: string;
}

const KEYS = {
  deviceId: 'st.deviceId',
  roster: 'st.roster',
  lastEvents: 'st.lastEvents',
  clockOffset: 'st.clockOffsetMs',
  queue: 'st.queue',
};

async function read<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}
const write = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));

export const store = {
  getDeviceId: () => read<string | null>(KEYS.deviceId, null),
  setDeviceId: (id: string) => write(KEYS.deviceId, id),

  getRoster: () => read<RosterEmployee[]>(KEYS.roster, []),
  setRoster: (r: RosterEmployee[]) => write(KEYS.roster, r),

  getLastEvents: () => read<Record<string, LastEvent>>(KEYS.lastEvents, {}),
  setLastEvents: (e: Record<string, LastEvent>) => write(KEYS.lastEvents, e),
  async setLastEvent(employeeId: string, e: LastEvent) {
    const all = await store.getLastEvents();
    all[employeeId] = e;
    await store.setLastEvents(all);
  },

  // Difference between server and kiosk clocks, applied to every captured_at.
  getClockOffset: () => read<number>(KEYS.clockOffset, 0),
  setClockOffset: (ms: number) => write(KEYS.clockOffset, ms),

  getQueue: () => read<SignedEvent[]>(KEYS.queue, []),
  setQueue: (q: SignedEvent[]) => write(KEYS.queue, q),
};

/** Kiosk-local date (the kiosk's Android time zone must be set to the factory time zone). */
export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
