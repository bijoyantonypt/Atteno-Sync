// POST /functions/v1/kiosk-sync
// Signed read used by the kiosk to refresh its roster, rules, server time and each
// employee's latest punch (needed to validate clock-in/out while offline).
// Signed message: sync|device_id|nonce|ts

import { db, requireSignedKioskRequest } from "../_shared/auth.ts";
import { loadConfig } from "../_shared/config.ts";
import { serve } from "../_shared/http.ts";

serve(async (body) => {
  await requireSignedKioskRequest(body, "sync");
  const { settings, shifts } = await loadConfig();

  const { data: employees, error } = await db
    .from("employees")
    .select("id, employee_code, full_name, full_name_hi, shift_code")
    .eq("status", "active")
    .order("full_name");
  if (error) throw error;

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: recent, error: recentError } = await db
    .from("attendance_events")
    .select("employee_id, event_type, captured_at, work_date")
    .eq("voided", false)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  if (recentError) throw recentError;

  const lastEvents: Record<string, { event_type: string; captured_at: string; work_date: string }> = {};
  for (const e of recent ?? []) lastEvents[e.employee_id] = e;

  return {
    server_time: Date.now(),
    timezone: settings.timezone,
    late_grace_minutes: settings.late_grace_minutes,
    shifts,
    employees,
    last_events: lastEvents,
  };
});
