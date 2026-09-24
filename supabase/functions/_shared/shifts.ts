// Shift rules and factory-local time helpers.

export interface Shift {
  code: string;
  start_time: string; // "08:00:00"
  end_time: string; // "17:15:00"
  break_minutes: number;
  standard_hours: number;
}

export interface Settings {
  timezone: string;
  late_grace_minutes: number;
  overtime_multiplier: number;
  currency: string;
}

export interface LocalTime {
  date: string; // YYYY-MM-DD in the factory time zone
  minutes: number; // minutes since local midnight
}

export function toLocal(instant: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Automatic shift segmentation: the employee's assigned shift wins; if none is
 * assigned, pick the shift whose start time is closest to the clock-in time.
 */
export function resolveShift(assigned: string | null, clockInMinutes: number, shifts: Shift[]): Shift {
  const fixed = assigned ? shifts.find((s) => s.code === assigned) : undefined;
  if (fixed) return fixed;
  return shifts.reduce((best, s) =>
    Math.abs(timeToMinutes(s.start_time) - clockInMinutes) <
        Math.abs(timeToMinutes(best.start_time) - clockInMinutes)
      ? s
      : best
  );
}

export const isLate = (clockInMinutes: number, shift: Shift, graceMinutes: number): boolean =>
  clockInMinutes > timeToMinutes(shift.start_time) + graceMinutes;

export const isEarlyDeparture = (clockOutMinutes: number, shift: Shift): boolean =>
  clockOutMinutes < timeToMinutes(shift.end_time);

/** First and last calendar day (YYYY-MM-DD) of a month. */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}
