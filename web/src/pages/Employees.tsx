import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Employee, Shift, supabase, unwrap } from '../lib/supabase';

type Draft = Omit<Employee, 'id' | 'fingerprint_enrolled_at'> & { id?: string };

const EMPTY: Draft = { employee_code: '', full_name: '', full_name_hi: '', shift_code: 'A', hourly_rate: 0, status: 'active' };

/** Add / edit employees. Fingerprints are enrolled on the kiosk in supervisor mode. */
export default function Employees({ shifts }: { shifts: Shift[] }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setEmployees(unwrap(await supabase.from('employees').select('*').order('employee_code')));
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const { id } = draft;
    // Only editable columns; fingerprint fields are owned by the kiosk enrolment flow.
    const payload = {
      employee_code: draft.employee_code.trim(),
      full_name: draft.full_name.trim(),
      full_name_hi: draft.full_name_hi?.trim() || null,
      shift_code: draft.shift_code || null,
      hourly_rate: Number(draft.hourly_rate),
      status: draft.status,
    };
    const { error } = id
      ? await supabase.from('employees').update(payload).eq('id', id)
      : await supabase.from('employees').insert(payload);
    if (error) return setError(error.code === '23505' ? 'That employee code is already used.' : error.message);
    setDraft(null);
    setError('');
    load();
  };

  const field = 'w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-lg';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">Employees</h2>
        <button onClick={() => setDraft({ ...EMPTY })} className="rounded-lg bg-green-700 px-4 py-2 text-lg font-semibold text-white">
          Add employee
        </button>
      </div>
      {error && <p className="text-lg font-semibold text-red-700">{error}</p>}

      {draft && (
        <form onSubmit={save} className="grid gap-3 rounded-2xl bg-white p-4 shadow md:grid-cols-3">
          <label>Code<input className={field} required value={draft.employee_code} onChange={(e) => setDraft({ ...draft, employee_code: e.target.value })} /></label>
          <label>Name<input className={field} required value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} /></label>
          <label>Name (Hindi)<input className={field} lang="hi" value={draft.full_name_hi ?? ''} onChange={(e) => setDraft({ ...draft, full_name_hi: e.target.value })} /></label>
          <label>Shift
            <select className={field} value={draft.shift_code ?? ''} onChange={(e) => setDraft({ ...draft, shift_code: e.target.value })}>
              {shifts.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              <option value="">Auto (by clock-in time)</option>
            </select>
          </label>
          <label>Hourly rate<input className={field} type="number" min="0" step="0.01" required value={draft.hourly_rate} onChange={(e) => setDraft({ ...draft, hourly_rate: Number(e.target.value) })} /></label>
          <label>Status
            <select className={field} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft['status'] })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <div className="flex gap-2 md:col-span-3">
            <button className="rounded-lg bg-[#12355B] px-6 py-2 text-lg font-semibold text-white">Save</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border-2 px-6 py-2 text-lg">Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full text-left text-lg">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">Code</th><th className="p-3">Name</th><th className="p-3">Shift</th>
              <th className="p-3">Rate</th><th className="p-3">Fingerprint</th><th className="p-3">Status</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className={`border-t ${emp.status === 'inactive' ? 'text-gray-500' : ''}`}>
                <td className="p-3">{emp.employee_code}</td>
                <td className="p-3">{emp.full_name}{emp.full_name_hi && <div className="text-base">{emp.full_name_hi}</div>}</td>
                <td className="p-3">{emp.shift_code ?? 'Auto'}</td>
                <td className="p-3">{Number(emp.hourly_rate).toFixed(2)}</td>
                <td className="p-3">{emp.fingerprint_enrolled_at ? <span className="text-green-800">Enrolled</span> : <span className="text-red-700">Not enrolled</span>}</td>
                <td className="p-3 capitalize">{emp.status}</td>
                <td className="p-3">
                  <button onClick={() => setDraft({ ...emp })} className="text-[#12355B] underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
