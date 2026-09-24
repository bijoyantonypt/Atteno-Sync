// POST /functions/v1/clock-event
// Accepts one or more signed clock events from a registered kiosk (live or offline-queued).
//
// Body: { device_id, events: [{ nonce, employee_id, event_type, captured_at, match_score, signature }] }
// Signed message per event: clock|device_id|nonce|employee_id|event_type|captured_at|match_score
//
// Result per event: accepted | duplicate (already stored, safe to drop) | rejected (+reason code)

import { db, loadDeviceKey, verifySignature } from "../_shared/auth.ts";
import { loadConfig } from "../_shared/config.ts";
import { HttpError, isUuid, serve } from "../_shared/http.ts";
import { isEarlyDeparture, isLate, resolveShift, type Settings, type Shift, toLocal } from "../_shared/shifts.ts";

const MAX_BATCH = 200;
const MAX_FUTURE_MS = 2 * 60_000; // tolerated kiosk clock drift
const MAX_OFFLINE_AGE_MS = 72 * 3_600_000; // oldest queued event accepted
const MIN_IN_OUT_GAP_MS = 60_000; // blocks accidental double taps
const MAX_SHIFT_SPAN_MS = 20 * 3_600_000; // a clock-out must follow its clock-in within 20h
const OFFLINE_THRESHOLD_MS = 2 * 60_000;

interface IncomingEvent {
  nonce: string;
  employee_id: string;
  event_type: "in" | "out";
  captured_at: string;
  match_score: number;
  signature: string;
}

type Result =
  | { nonce: string; status: "accepted"; event: Record<string, unknown> }
  | { nonce: string; status: "duplicate" }
  | { nonce: string; status: "rejected"; reason: string };

function parseEvent(raw: unknown): IncomingEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (!isUuid(e.nonce) || !isUuid(e.employee_id)) return null;
  if (e.event_type !== "in" && e.event_type !== "out") return null;
  if (typeof e.captured_at !== "string" || Number.isNaN(Date.parse(e.captured_at))) return null;
  if (!Number.isInteger(e.match_score) || typeof e.signature !== "string") return null;
  return e as unknown as IncomingEvent;
}

async function processEvent(
  ev: IncomingEvent,
  deviceId: string,
  key: CryptoKey,
  settings: Settings,
  shifts: Shift[],
): Promise<Result> {
  const reject = (reason: string): Result => ({ nonce: ev.nonce, status: "rejected", reason });

  const message = ["clock", deviceId, ev.nonce, ev.employee_id, ev.event_type, ev.captured_at, ev.match_score].join("|");
  if (!(await verifySignature(key, message, ev.signature))) return reject("BAD_SIGNATURE");

  const now = Date.now();
  const captured = Date.parse(ev.captured_at);
  if (captured > now + MAX_FUTURE_MS) return reject("FUTURE_TIMESTAMP");
  if (captured < now - MAX_OFFLINE_AGE_MS) return reject("STALE_EVENT");

  // Replay protection: a nonce is accepted once; a resend of the same event is a harmless duplicate.
  const { data: existing } = await db.from("attendance_events").select("id").eq("nonce", ev.nonce).maybeSingle();
  if (existing) return { nonce: ev.nonce, status: "duplicate" };

  const { data: employee } = await db
    .from("employees")
    .select("id, full_name, shift_code, status")
    .eq("id", ev.employee_id)
    .maybeSingle();
  if (!employee || employee.status !== "active") return reject("INACTIVE_EMPLOYEE");

  const { data: last } = await db
    .from("attendance_events")
    .select("event_type, captured_at, work_date, shift_code")
    .eq("employee_id", ev.employee_id)
    .eq("voided", false)
    .lt("captured_at", new Date(captured).toISOString())
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const local = toLocal(new Date(captured), settings.timezone);
  const lastMs = last ? Date.parse(last.captured_at) : 0;
  if (last && captured - lastMs < MIN_IN_OUT_GAP_MS) return reject("TOO_SOON");

  let workDate: string;
  let shift: Shift;
  let wasLate = false;
  let wasEarly = false;

  if (ev.event_type === "in") {
    // A forgotten clock-out from a previous day must not block today's clock-in.
    if (last?.event_type === "in" && last.work_date === local.date) return reject("ALREADY_IN");
    shift = resolveShift(employee.shift_code, local.minutes, shifts);
    workDate = local.date;
    wasLate = isLate(local.minutes, shift, settings.late_grace_minutes);
  } else {
    if (!last || last.event_type !== "in" || captured - lastMs > MAX_SHIFT_SPAN_MS) return reject("NOT_IN");
    shift = shifts.find((s) => s.code === last.shift_code)!;
    workDate = last.work_date;
    wasEarly = local.date === workDate && isEarlyDeparture(local.minutes, shift);
  }

  const { data: inserted, error } = await db
    .from("attendance_events")
    .insert({
      employee_id: ev.employee_id,
      event_type: ev.event_type,
      captured_at: new Date(captured).toISOString(),
      work_date: workDate,
      shift_code: shift.code,
      was_late: wasLate,
      was_early: wasEarly,
      device_id: deviceId,
      nonce: ev.nonce,
      match_score: ev.match_score,
      source: "kiosk",
      synced_offline: now - captured > OFFLINE_THRESHOLD_MS,
    })
    .select("id, event_type, captured_at, work_date, shift_code, was_late, was_early")
    .single();

  if (error) {
    if (error.code === "23505") return { nonce: ev.nonce, status: "duplicate" }; // concurrent resend
    throw error;
  }
  return { nonce: ev.nonce, status: "accepted", event: { ...inserted, employee_name: employee.full_name } };
}

serve(async (body) => {
  const events = body.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_BATCH) {
    throw new HttpError(400, `events must contain 1-${MAX_BATCH} items`);
  }
  const parsed = events.map(parseEvent);
  if (parsed.some((e) => e === null)) throw new HttpError(400, "Malformed event in batch");

  const { id: deviceId, key } = await loadDeviceKey(body.device_id);
  const { settings, shifts } = await loadConfig();

  // Process in capture order so in/out sequencing is evaluated correctly for offline batches.
  const ordered = (parsed as IncomingEvent[]).sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
  const results: Result[] = [];
  for (const ev of ordered) results.push(await processEvent(ev, deviceId, key, settings, shifts));
  return { results };
});
