// POST /functions/v1/generate-payroll
// Computes and stores the monthly payroll for every employee with attendance in the month.
// Body: { year, month }  -> { rows: [...] }

import { db, requireAdmin } from "../_shared/auth.ts";
import { loadConfig } from "../_shared/config.ts";
import { HttpError, serve } from "../_shared/http.ts";
import { computeDays, computeMonthlyPayroll, type Punch } from "../_shared/payroll.ts";
import { monthRange } from "../_shared/shifts.ts";

serve(async (body, req) => {
  const adminId = await requireAdmin(req);
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(400, "year and month are required");
  }

  const { settings, shiftsByCode } = await loadConfig();
  const { start, end } = monthRange(year, month);

  // PostgREST caps responses (default 1000 rows), so page through the month.
  const PAGE = 1000;
  const punches: (Punch & { employee_id: string })[] = [];
  for (let from = 0;; from += PAGE) {
    const { data, error } = await db
      .from("attendance_events")
      .select("id, employee_id, event_type, captured_at, work_date, shift_code, was_late, was_early")
      .eq("voided", false)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    punches.push(...(data as (Punch & { employee_id: string })[]));
    if (data.length < PAGE) break;
  }

  const byEmployee = new Map<string, Punch[]>();
  for (const p of punches) {
    const list = byEmployee.get(p.employee_id) ?? [];
    list.push(p as Punch);
    byEmployee.set(p.employee_id, list);
  }
  // Drop snapshot rows for employees who no longer have valid punches (e.g. all voided).
  const withPunches = [...byEmployee.keys()];
  let stale = db.from("payroll").delete().eq("year", year).eq("month", month);
  if (withPunches.length) stale = stale.not("employee_id", "in", `(${withPunches.join(",")})`);
  const { error: staleError } = await stale;
  if (staleError) throw staleError;
  if (withPunches.length === 0) return { currency: settings.currency, rows: [] };

  const { data: employees, error: empError } = await db
    .from("employees")
    .select("id, employee_code, full_name, hourly_rate")
    .in("id", [...byEmployee.keys()]);
  if (empError) throw empError;

  const computed = (employees ?? []).map((emp) => {
    const days = computeDays(byEmployee.get(emp.id)!, shiftsByCode);
    const result = computeMonthlyPayroll(days, shiftsByCode, Number(emp.hourly_rate), settings.overtime_multiplier);
    return {
      employee: emp,
      row: { employee_id: emp.id, year, month, ...result, generated_at: new Date().toISOString(), generated_by: adminId },
    };
  });

  const { error: upsertError } = await db
    .from("payroll")
    .upsert(computed.map((c) => c.row), { onConflict: "employee_id,year,month" });
  if (upsertError) throw upsertError;

  return {
    currency: settings.currency,
    rows: computed
      .map(({ employee, row }) => ({ ...row, employee_code: employee.employee_code, full_name: employee.full_name }))
      .sort((a, b) => a.employee_code.localeCompare(b.employee_code)),
  };
});
