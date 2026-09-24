// HTTPS client for Atteno_Sync Edge Functions. Every kiosk request is signed with the
// device's Keystore key; admin calls carry the admin's Supabase access token.
import { FUNCTIONS_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { scanner } from '../native/scanner';
import { LastEvent, RosterEmployee, SignedEvent, store } from './store';

export class NetworkError extends Error {
  code = 'NETWORK';
}
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown, accessToken?: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError('Network unavailable');
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? data.error_description ?? `HTTP ${res.status}`);
  return data as T;
}

/** Signed read request: `${purpose}|device|nonce|ts|...extra`. */
async function signedRead<T>(fn: string, purpose: string, deviceId: string, extra: Record<string, string> = {}) {
  const nonce = await scanner.nonce();
  const ts = Date.now() + (await store.getClockOffset());
  const signature = await scanner.sign([purpose, deviceId, nonce, ts, ...Object.values(extra)].join('|'));
  return post<T>(`${FUNCTIONS_URL}/${fn}`, { device_id: deviceId, nonce, ts, signature, ...extra });
}

// ---------------------------------------------------------------------------
// Clock events
// ---------------------------------------------------------------------------
export async function signClockEvent(
  deviceId: string,
  employeeId: string,
  eventType: 'in' | 'out',
  capturedAt: string,
  matchScore: number,
): Promise<SignedEvent> {
  const nonce = await scanner.nonce();
  const message = ['clock', deviceId, nonce, employeeId, eventType, capturedAt, matchScore].join('|');
  return {
    nonce,
    employee_id: employeeId,
    event_type: eventType,
    captured_at: capturedAt,
    match_score: matchScore,
    signature: await scanner.sign(message),
  };
}

export type ClockResult =
  | { nonce: string; status: 'accepted'; event: { was_late: boolean; captured_at: string; work_date: string } }
  | { nonce: string; status: 'duplicate' }
  | { nonce: string; status: 'rejected'; reason: string };

export async function sendClockEvents(deviceId: string, events: SignedEvent[]): Promise<ClockResult[]> {
  const res = await post<{ results: ClockResult[] }>(`${FUNCTIONS_URL}/clock-event`, { device_id: deviceId, events });
  return res.results;
}

// ---------------------------------------------------------------------------
// Roster sync / history
// ---------------------------------------------------------------------------
interface SyncResponse {
  server_time: number;
  employees: RosterEmployee[];
  last_events: Record<string, LastEvent>;
}

/** Refreshes roster, last punches and clock offset. Call on start-up and periodically. */
export async function syncRoster(deviceId: string): Promise<void> {
  const sentAt = Date.now();
  const res = await signedRead<SyncResponse>('kiosk-sync', 'sync', deviceId);
  const roundTrip = Date.now() - sentAt;
  await store.setClockOffset(Math.round(res.server_time + roundTrip / 2 - Date.now()));
  await store.setRoster(res.employees);
  // Keep local punches that the server has not seen yet (queued offline).
  const local = await store.getLastEvents();
  const merged = { ...local };
  for (const [id, ev] of Object.entries(res.last_events)) {
    if (!local[id] || Date.parse(ev.captured_at) >= Date.parse(local[id].captured_at)) merged[id] = ev as LastEvent;
  }
  await store.setLastEvents(merged);
}

export interface HistoryDay {
  work_date: string;
  first_in: string | null;
  last_out: string | null;
  worked_minutes: number;
  overtime_minutes: number;
  was_late: boolean;
  status: 'complete' | 'missing_out';
}
export interface HistoryResponse {
  employee: { full_name: string; full_name_hi: string | null };
  currency: string;
  days: HistoryDay[];
  latest_payslip: null | {
    year: number;
    month: number;
    days_worked: number;
    overtime_hours: number;
    base_pay: number;
    overtime_pay: number;
    total_pay: number;
  };
}

export const fetchHistory = (deviceId: string, employeeId: string) =>
  signedRead<HistoryResponse>('employee-history', 'history', deviceId, { employee_id: employeeId });

// ---------------------------------------------------------------------------
// Admin mode (kiosk setup and enrolment)
// ---------------------------------------------------------------------------
export async function adminSignIn(email: string, password: string): Promise<string> {
  const res = await post<{ access_token: string }>(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    email,
    password,
  });
  return res.access_token;
}

/** Upgrades an admin session to aal2 with a TOTP code (only needed if the admin enabled 2FA). */
export async function verifyTotp(token: string, code: string): Promise<string> {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  }).catch(() => {
    throw new NetworkError('Network unavailable');
  });
  const user = await userRes.json();
  const factor = (user.factors ?? []).find((f: { factor_type: string; status: string }) =>
    f.factor_type === 'totp' && f.status === 'verified');
  if (!factor) throw new ApiError(400, 'No authenticator app is set up for this account');

  const base = `${SUPABASE_URL}/auth/v1/factors/${factor.id}`;
  const challenge = await post<{ id: string }>(`${base}/challenge`, {}, token);
  const verified = await post<{ access_token: string }>(`${base}/verify`, { challenge_id: challenge.id, code }, token);
  return verified.access_token;
}

export const registerDevice = (token: string, name: string, publicKey: string) =>
  post<{ device_id: string }>(`${FUNCTIONS_URL}/register-device`, { name, public_key_spki: publicKey }, token);

export const recordEnrollment = (token: string, employeeId: string, fingerprintHash: string | null) =>
  post<{ ok: true }>(`${FUNCTIONS_URL}/enroll-employee`, { employee_id: employeeId, fingerprint_hash: fingerprintHash }, token);


