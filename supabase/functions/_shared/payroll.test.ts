// Run: deno test supabase/functions/_shared/payroll.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { computeDay, computeDays, computeMonthlyPayroll, type Punch } from "./payroll.ts";
import { resolveShift, type Shift, toLocal } from "./shifts.ts";

const shiftA: Shift = { code: "A", start_time: "08:00:00", end_time: "17:15:00", break_minutes: 75, standard_hours: 8 };
const shiftB: Shift = { code: "B", start_time: "09:00:00", end_time: "18:15:00", break_minutes: 75, standard_hours: 8 };
const shifts = new Map([["A", shiftA], ["B", shiftB]]);

const punch = (type: "in" | "out", date: string, time: string, shift = "A"): Punch => ({
  event_type: type,
  captured_at: `${date}T${time}:00+05:30`,
  work_date: date,
  shift_code: shift,
});

Deno.test("full shift A day has 8h worked, no overtime", () => {
  const d = computeDay("2026-09-01", [punch("in", "2026-09-01", "08:00"), punch("out", "2026-09-01", "17:15")], shiftA);
  assertEquals([d.worked_minutes, d.overtime_minutes, d.status], [480, 0, "complete"]);
});

Deno.test("staying until 19:15 on shift A gives 2h overtime", () => {
  const d = computeDay("2026-09-01", [punch("in", "2026-09-01", "08:00"), punch("out", "2026-09-01", "19:15")], shiftA);
  assertEquals(d.overtime_minutes, 120);
});

Deno.test("recorded lunch gap is not double-deducted", () => {
  const d = computeDay("2026-09-01", [
    punch("in", "2026-09-01", "08:00"),
    punch("out", "2026-09-01", "12:30"),
    punch("in", "2026-09-01", "13:30"), // 60 min gap -> only 15 more minutes deducted
    punch("out", "2026-09-01", "17:15"),
  ], shiftA);
  assertEquals(d.worked_minutes, 270 + 225 - 15);
});

Deno.test("missing clock-out counts as incomplete, not worked", () => {
  const days = computeDays([punch("in", "2026-09-02", "08:00")], shifts);
  const p = computeMonthlyPayroll(days, shifts, 100, 1.5);
  assertEquals([p.days_worked, p.incomplete_days, p.total_pay], [0, 1, 0]);
});

Deno.test("monthly payroll: 22 days, 10h overtime, rate 100", () => {
  const punches: Punch[] = [];
  for (let day = 1; day <= 22; day++) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    punches.push(punch("in", date, "09:00", "B"));
    // First 5 days: 2h overtime each (out 20:15 instead of 18:15)
    punches.push(punch("out", date, day <= 5 ? "20:15" : "18:15", "B"));
  }
  const p = computeMonthlyPayroll(computeDays(punches, shifts), shifts, 100, 1.5);
  assertEquals(p.days_worked, 22);
  assertEquals(p.base_hours, 176);
  assertEquals(p.overtime_hours, 10);
  assertEquals(p.base_pay, 17600);
  assertEquals(p.overtime_pay, 1500);
  assertEquals(p.total_pay, 19100);
});

Deno.test("auto shift detection picks the nearest start time", () => {
  assertEquals(resolveShift(null, 8 * 60 + 50, [shiftA, shiftB]).code, "B");
  assertEquals(resolveShift(null, 7 * 60 + 55, [shiftA, shiftB]).code, "A");
  assertEquals(resolveShift("A", 9 * 60, [shiftA, shiftB]).code, "A");
});

Deno.test("toLocal converts UTC to factory time", () => {
  assertEquals(toLocal(new Date("2026-09-01T02:32:00Z"), "Asia/Kolkata"), { date: "2026-09-01", minutes: 8 * 60 + 2 });
});
