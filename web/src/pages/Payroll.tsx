import { useCallback, useEffect, useState } from 'react';
import { downloadCsv, downloadPayslip } from '../lib/export';
import { AttendanceEvent, formatTime, money, PayrollRow, Settings, supabase, unwrap } from '../lib/supabase';

const COMPANY_NAME = 'ShiftTrack Payroll';

function previousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Payroll({ settings }: { settings: Settings }) {
  const [period, setPeriod] = useState(previousMonth()); // "YYYY-MM"
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [year, month] = period.split('-').map(Number);

  // Show the stored snapshot for the selected month, if one was generated before.
  const loadSaved = useCallback(async () => {
    const data = unwrap(
      await supabase
        .from('payroll')
        .select('*, employees(employee_code, full_name)')
        .eq('year', year)
        .eq('month', month),
    ) as (PayrollRow & { employees: { employee_code: string; full_name: string } })[];
    setRows(data.map((r) => ({ ...r, ...r.employees })).sort((a, b) => a.employee_code.localeCompare(b.employee_code)));
  }, [year, month]);

  useEffect(() => {
    loadSaved().catch((e) => setError(e.message));
  }, [loadSaved]);

  const generate = async () => {
    setBusy(true);
    setError('');
    const { data, error } = await supabase.functions.invoke('generate-payroll', { body: { year, month } });
    setBusy(false);
    if (error) return setError('Payroll could not be generated. Please try again.');
    setRows(data.rows);
  };

  const exportPayroll = () =>
    downloadCsv(
      `payroll_${period}.csv`,
      ['Code', 'Name', 'Days worked', 'Incomplete days', 'Base hours', 'Overtime hours', 'Hourly rate', 'OT multiplier', 'Base pay', 'Overtime pay', 'Total pay'],
      rows.map((r) => [r.employee_code, r.full_name, r.days_worked, r.incomplete_days, r.base_hours, r.overtime_hours, r.hourly_rate, r.overtime_multiplier, r.base_pay, r.overtime_pay, r.total_pay]),
    );

  const exportAttendance = async () => {
    const last = new Date(year, month, 0).getDate();
    type Row = AttendanceEvent & { employees: { employee_code: string; full_name: string } };
    const events: Row[] = [];
    // PostgREST returns at most 1000 rows per request (Supabase default), so page through.
    for (let from = 0; ; from += 1000) {
      const res = await supabase
        .from('attendance_events')
        .select('*, employees(employee_code, full_name)')
        .gte('work_date', `${period}-01`)
        .lte('work_date', `${period}-${last}`)
        .eq('voided', false)
        .order('id')
        .range(from, from + 999);
      if (res.error) return setError(res.error.message);
      events.push(...(res.data as Row[]));
      if (res.data.length < 1000) break;
    }
    events.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    downloadCsv(
      `attendance_${period}.csv`,
      ['Date', 'Code', 'Name', 'Type', 'Time', 'Shift', 'Late', 'Left early', 'Synced offline'],
      events.map((e) => [e.work_date, e.employees.employee_code, e.employees.full_name, e.event_type, formatTime(e.captured_at, settings.timezone), e.shift_code, e.was_late, e.was_early, e.synced_offline]),
    );
  };

  const total = rows.reduce((s, r) => s + Number(r.total_pay), 0);
  const btn = 'rounded-lg px-4 py-2 text-lg font-semibold disabled:opacity-50';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">Payroll</h2>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border-2 border-gray-300 px-3 py-2 text-lg" />
        <button onClick={generate} disabled={busy} className={`${btn} bg-green-700 text-white`}>
          {busy ? 'Calculating…' : 'Generate Payroll'}
        </button>
        <button onClick={exportPayroll} disabled={!rows.length} className={`${btn} border-2 border-[#12355B] text-[#12355B]`}>Payroll CSV</button>
        <button onClick={exportAttendance} className={`${btn} border-2 border-[#12355B] text-[#12355B]`}>Attendance CSV</button>
      </div>
      {error && <p className="text-lg font-semibold text-red-700">{error}</p>}
      <p className="text-gray-700">
        Base pay = days worked × shift hours × rate. Overtime = hours beyond the shift limit each day × rate × {settings.overtime_multiplier}.
      </p>

      <div className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full text-left text-lg">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">Employee</th><th className="p-3">Days</th><th className="p-3">Base h</th><th className="p-3">OT h</th>
              <th className="p-3">Base pay</th><th className="p-3">OT pay</th><th className="p-3">Total</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-t">
                <td className="p-3">
                  <div className="font-semibold">{r.full_name}</div>
                  <div className="text-sm text-gray-600">{r.employee_code}</div>
                  {r.incomplete_days > 0 && <div className="text-sm font-semibold text-orange-700">{r.incomplete_days} day(s) missing clock-out</div>}
                </td>
                <td className="p-3">{r.days_worked}</td>
                <td className="p-3">{r.base_hours}</td>
                <td className="p-3">{r.overtime_hours}</td>
                <td className="p-3">{money(r.base_pay, settings.currency)}</td>
                <td className="p-3">{money(r.overtime_pay, settings.currency)}</td>
                <td className="p-3 font-bold">{money(r.total_pay, settings.currency)}</td>
                <td className="p-3">
                  <button onClick={() => downloadPayslip(r, settings.currency, COMPANY_NAME)} className="text-[#12355B] underline">Pay slip PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-50 font-bold">
                <td className="p-3" colSpan={6}>Total</td>
                <td className="p-3">{money(total, settings.currency)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
