// POST /functions/v1/employee-history
// Called by the kiosk right after a fingerprint match so the employee can see their
// last 31 days and latest pay stub without any password.
// Signed message: history|device_id|nonce|ts|employee_id

import { db, requireSignedKioskRequest } from "../_shared/auth.ts";
import { loadConfig } from "../_shared/config.ts";
import { HttpError, requireUuid, serve } from "../_shared/http.ts";
import { computeDays } from "../_shared/payroll.ts";
import { toLocal } from "../_shared/shifts.ts";

serve(async (body) => {
  const employeeId = requireUuid(body.employee_id, "employee_id");
  await requireSignedKioskRequest(body, "history", [employeeId]);
  const { settings, shiftsByCode } = await loadConfig();

  const { data: employee } = await db
    .from("employees")
    .select("full_name, full_name_hi, status")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee || employee.status !== "active") throw new HttpError(404, "Employee not found");

  const from = toLocal(new Date(Date.now() - 31 * 86_400_000), settings.timezone).date;
  const { data: punches, error } = await db
    .from("attendance_events")
    .select("event_type, captured_at, work_date, shift_code, was_late, was_early")
    .eq("employee_id", employeeId)
    .eq("voided", false)
    .gte("work_date", from)
    .order("captured_at", { ascending: true });
  if (error) throw error;

  const { data: payslip } = await db
    .from("payroll")
    .select("year, month, days_worked, base_hours, overtime_hours, base_pay, overtime_pay, total_pay")
    .eq("employee_id", employeeId)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    employee: { full_name: employee.full_name, full_name_hi: employee.full_name_hi },
    currency: settings.currency,
    days: computeDays(punches ?? [], shiftsByCode).reverse(),
    latest_payslip: payslip,
  };
});
