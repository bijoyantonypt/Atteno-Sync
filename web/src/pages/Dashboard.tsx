import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AttendanceEvent, Employee, formatTime, minutesNowIn, Settings, Shift, supabase, timeToMinutes, todayIn, unwrap,
} from '../lib/supabase';

type Status = 'on_time' | 'late' | 'absent' | 'not_yet';

const STATUS_STYLE: Record<Status, { label: string; cls: string }> = {
  on_time: { label: 'On time', cls: 'bg-green-700 text-white' },
  late: { label: 'Late', cls: 'bg-orange-600 text-white' },
  absent: { label: 'Absent', cls: 'bg-red-700 text-white' },
  not_yet: { label: 'Not in yet', cls: 'bg-gray-300 text-gray-900' },
};

interface Row {
  employee: Employee;
  events: AttendanceEvent[];
  firstIn?: AttendanceEvent;
  lastOut?: AttendanceEvent;
  stillIn: boolean;
  status: Status;
}

export default function Dashboard({ settings, shifts }: { settings: Settings; shifts: Shift[] }) {
  const tz = settings.timezone;
  const [date, setDate] = useState(todayIn(tz));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [emps, evs] = await Promise.all([
        supabase.from('employees').select('*').order('employee_code'),
        supabase.from('attendance_events').select('*').eq('work_date', date).eq('voided', false).order('captured_at'),
      ]);
      setEmployees(unwrap(emps));
      setEvents(unwrap(evs));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [date]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000); // live-ish refresh for today's view
    return () => clearInterval(id);
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const isToday = date === todayIn(tz);
    const nowMin = minutesNowIn(tz);
    return employees
      .map((employee) => {
        const own = events.filter((e) => e.employee_id === employee.id);
        const firstIn = own.find((e) => e.event_type === 'in');
        const lastOut = [...own].reverse().find((e) => e.event_type === 'out');
        const shift = shifts.find((s) => s.code === (firstIn?.shift_code ?? employee.shift_code)) ?? shifts[0];
        const beforeStart = isToday && nowMin <= timeToMinutes(shift.start_time) + settings.late_grace_minutes;
        const status: Status = firstIn ? (firstIn.was_late ? 'late' : 'on_time') : beforeStart ? 'not_yet' : 'absent';
        return { employee, events: own, firstIn, lastOut, stillIn: own.at(-1)?.event_type === 'in', status };
      })
      .filter((r) => r.employee.status === 'active' || r.events.length > 0);
  }, [employees, events, shifts, date, tz, settings.late_grace_minutes]);

  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const early = rows.filter((r) => r.lastOut?.was_early && !r.stillIn).length;

  // "Reset" = void (soft delete). The row stays for audit and is excluded from payroll.
  const voidEvent = async (ev: AttendanceEvent, name: string) => {
    if (!confirm(`Remove ${name}'s clock-${ev.event_type} at ${formatTime(ev.captured_at, tz)}?`)) return;
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('attendance_events')
      .update({ voided: true, voided_by: data.user?.id, voided_at: new Date().toISOString() })
      .eq('id', ev.id);
    if (error) setError(error.message);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">Attendance</h2>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border-2 border-gray-300 px-3 py-2 text-lg" />
      </div>
      {error && <p className="text-lg font-semibold text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Present" value={count('on_time') + count('late')} cls="border-green-700" />
        <Card label="Late" value={count('late')} cls="border-orange-600" />
        <Card label="Absent" value={count('absent')} cls="border-red-700" />
        <Card label="Left early" value={early} cls="border-[#12355B]" />
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full text-left text-lg">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">Employee</th>
              <th className="p-3">Shift</th>
              <th className="p-3">In</th>
              <th className="p-3">Out</th>
              <th className="p-3">Status</th>
              <th className="p-3">Punches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee.id} className="border-t align-top">
                <td className="p-3">
                  <div className="font-semibold">{r.employee.full_name}</div>
                  <div className="text-sm text-gray-600">{r.employee.employee_code}</div>
                </td>
                <td className="p-3">{r.firstIn?.shift_code ?? r.employee.shift_code ?? 'Auto'}</td>
                <td className="p-3">{r.firstIn ? formatTime(r.firstIn.captured_at, tz) : '—'}</td>
                <td className="p-3">
                  {r.stillIn ? <span className="text-gray-600">Still in</span> : r.lastOut ? formatTime(r.lastOut.captured_at, tz) : '—'}
                  {r.lastOut?.was_early && !r.stillIn && <div className="text-sm font-semibold text-[#12355B]">Left early</div>}
                </td>
                <td className="p-3">
                  <span className={`rounded-full px-3 py-1 text-base font-semibold ${STATUS_STYLE[r.status].cls}`}>
                    {STATUS_STYLE[r.status].label}
                  </span>
                </td>
                <td className="p-3 text-base">
                  {r.events.map((ev) => (
                    <div key={ev.id} className="flex items-center gap-2">
                      <span>{ev.event_type === 'in' ? 'In' : 'Out'} {formatTime(ev.captured_at, tz)}{ev.source === 'essl' ? ' 🖲 eSSL' : ev.synced_offline ? ' (offline)' : ''}</span>
                      <button onClick={() => voidEvent(ev, r.employee.full_name)} className="text-sm text-red-700 underline">
                        remove
                      </button>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-2xl border-l-8 bg-white p-4 shadow ${cls}`}>
      <div className="text-lg text-gray-700">{label}</div>
      <div className="text-4xl font-bold">{value}</div>
    </div>
  );
}
