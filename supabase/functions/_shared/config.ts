import { db } from "./auth.ts";
import type { Settings, Shift } from "./shifts.ts";

export async function loadConfig(): Promise<{ settings: Settings; shifts: Shift[]; shiftsByCode: Map<string, Shift> }> {
  const [settingsRes, shiftsRes] = await Promise.all([
    db.from("settings").select("timezone, late_grace_minutes, overtime_multiplier, currency").eq("id", 1).single(),
    db.from("shifts").select("code, start_time, end_time, break_minutes, standard_hours").order("code"),
  ]);
  if (settingsRes.error || shiftsRes.error || !shiftsRes.data?.length) {
    throw new Error("Settings or shifts are not configured");
  }
  // Normalise Postgres numeric columns to JS numbers
  const settings: Settings = { ...settingsRes.data, overtime_multiplier: Number(settingsRes.data.overtime_multiplier) };
  const shifts: Shift[] = shiftsRes.data.map((s) => ({ ...s, standard_hours: Number(s.standard_hours) }));
  return { settings, shifts, shiftsByCode: new Map(shifts.map((s) => [s.code, s])) };
}
