// Atteno_Sync payroll engine (pure functions, unit-tested in payroll.test.ts).
//
// Daily:
//   worked_minutes   = Σ(out − in over paired punches) − max(0, break_minutes − Σ recorded gaps)
//   overtime_minutes = max(0, worked_minutes − standard_hours × 60)
// Monthly:
//   days_worked    = days with at least one complete in/out pair
//   base_hours     = Σ standard_hours of the shift on each worked day   (= days_worked × 8 by default)
//   overtime_hours = Σ overtime_minutes / 60
//   base_pay       = base_hours × hourly_rate
//   overtime_pay   = overtime_hours × hourly_rate × overtime_multiplier (1.5)
//   total_pay      = base_pay + overtime_pay

import type { Shift } from "./shifts.ts";

export interface Punch {
  event_type: "in" | "out";
  captured_at: string; // ISO-8601
  work_date: string; // YYYY-MM-DD
  shift_code: string;
  was_late?: boolean;
  was_early?: boolean;
}

export interface DayResult {
  work_date: string;
  shift_code: string;
  first_in: string | null;
  last_out: string | null;
  worked_minutes: number;
  overtime_minutes: number;
  was_late: boolean;
  was_early: boolean;
  status: "complete" | "missing_out";
}

export interface PayrollResult {
  days_worked: number;
  incomplete_days: number;
  base_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  overtime_multiplier: number;
  base_pay: number;
  overtime_pay: number;
  total_pay: number;
  daily_breakdown: DayResult[];
}

const MINUTE = 60_000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Groups punches by work_date (sorted by capture time within each day). */
export function groupByDay(punches: Punch[]): Map<string, Punch[]> {
  const days = new Map<string, Punch[]>();
  for (const p of [...punches].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))) {
    const list = days.get(p.work_date) ?? [];
    list.push(p);
    days.set(p.work_date, list);
  }
  return days;
}

/** Computes worked and overtime minutes for one employee-day. `punches` must be time-sorted. */
export function computeDay(workDate: string, punches: Punch[], shift: Shift): DayResult {
  let pairedMs = 0;
  let gapMs = 0;
  let openIn: number | null = null;
  let lastOut: number | null = null;
  let firstIn: string | null = null;
  let lastOutIso: string | null = null;

  for (const p of punches) {
    const t = Date.parse(p.captured_at);
    if (p.event_type === "in") {
      if (openIn !== null) continue; // duplicate clock-in: keep the earlier one
      if (lastOut !== null) gapMs += t - lastOut; // recorded break (e.g. clocked out for lunch)
      openIn = t;
      firstIn ??= p.captured_at;
    } else if (openIn !== null) {
      pairedMs += t - openIn;
      lastOut = t;
      lastOutIso = p.captured_at;
      openIn = null;
    }
  }

  const pairedMinutes = Math.floor(pairedMs / MINUTE);
  // Unpaid break is deducted only for the part not already excluded by recorded gaps.
  const breakDeduction = Math.max(0, shift.break_minutes - Math.floor(gapMs / MINUTE));
  const worked = pairedMinutes > 0 ? Math.max(0, pairedMinutes - breakDeduction) : 0;
  const overtime = Math.max(0, worked - Math.round(shift.standard_hours * 60));

  return {
    work_date: workDate,
    shift_code: shift.code,
    first_in: firstIn,
    last_out: lastOutIso,
    worked_minutes: worked,
    overtime_minutes: overtime,
    was_late: punches.some((p) => p.event_type === "in" && p.was_late),
    was_early: punches.filter((p) => p.event_type === "out").at(-1)?.was_early ?? false,
    status: openIn !== null ? "missing_out" : "complete",
  };
}

/** Builds day results for one employee from raw punches. */
export function computeDays(punches: Punch[], shiftsByCode: Map<string, Shift>): DayResult[] {
  return [...groupByDay(punches).entries()].map(([date, dayPunches]) => {
    const shift = shiftsByCode.get(dayPunches[0].shift_code);
    if (!shift) throw new Error(`Unknown shift ${dayPunches[0].shift_code}`);
    return computeDay(date, dayPunches, shift);
  });
}

/** Monthly payroll for one employee. */
export function computeMonthlyPayroll(
  days: DayResult[],
  shiftsByCode: Map<string, Shift>,
  hourlyRate: number,
  overtimeMultiplier: number,
): PayrollResult {
  const workedDays = days.filter((d) => d.last_out !== null && d.worked_minutes > 0);
  const baseHours = round2(workedDays.reduce((sum, d) => sum + shiftsByCode.get(d.shift_code)!.standard_hours, 0));
  const overtimeHours = round2(workedDays.reduce((sum, d) => sum + d.overtime_minutes, 0) / 60);
  const basePay = round2(baseHours * hourlyRate);
  const overtimePay = round2(overtimeHours * hourlyRate * overtimeMultiplier);

  return {
    days_worked: workedDays.length,
    incomplete_days: days.filter((d) => d.last_out === null).length,
    base_hours: baseHours,
    overtime_hours: overtimeHours,
    hourly_rate: hourlyRate,
    overtime_multiplier: overtimeMultiplier,
    base_pay: basePay,
    overtime_pay: overtimePay,
    total_pay: round2(basePay + overtimePay),
    daily_breakdown: days,
  };
}


