import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

export interface Settings {
  timezone: string;
  late_grace_minutes: number;
  overtime_multiplier: number;
  currency: string;
}

export interface Shift {
  code: string;
  name: string;
  start_time: string;
  end_time: string;
}

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  full_name_hi: string | null;
  shift_code: string | null;
  hourly_rate: number;
  status: 'active' | 'inactive';
  fingerprint_enrolled_at: string | null;
}

export interface AttendanceEvent {
  id: number;
  employee_id: string;
  event_type: 'in' | 'out';
  captured_at: string;
  work_date: string;
  shift_code: string;
  was_late: boolean;
  was_early: boolean;
  synced_offline: boolean;
  voided: boolean;
  source: 'kiosk' | 'admin' | 'essl'; 
}

export interface PayrollRow {
  employee_id: string;
  employee_code: string;
  full_name: string;
  year: number;
  month: number;
  days_worked: number;
  incomplete_days: number;
  base_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  overtime_multiplier: number;
  base_pay: number;
  overtime_pay: number;
  total_pay: number;
}

/** Throws the Supabase error so callers can show one message. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function loadReferenceData(): Promise<{ settings: Settings; shifts: Shift[] }> {
  const [settings, shifts] = await Promise.all([
    supabase.from('settings').select('timezone, late_grace_minutes, overtime_multiplier, currency').eq('id', 1).single(),
    supabase.from('shifts').select('code, name, start_time, end_time').order('code'),
  ]);
  return { settings: unwrap(settings), shifts: unwrap(shifts) };
}

// ---------------------------------------------------------------------------
// Formatting in the factory time zone
// ---------------------------------------------------------------------------
export const formatTime = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone });

export const todayIn = (timeZone: string) => new Date().toLocaleDateString('en-CA', { timeZone }); // YYYY-MM-DD

export const minutesNowIn = (timeZone: string) => {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).split(':');
  return Number(h) * 60 + Number(m);
};

export const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(n);
