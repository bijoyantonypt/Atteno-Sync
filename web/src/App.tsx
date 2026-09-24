import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { loadReferenceData, Settings, Shift, supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Login from './pages/Login';
import Payroll from './pages/Payroll';
import Security from './pages/Security';

const TABS = ['Today', 'Employees', 'Payroll', 'Security'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [ref, setRef] = useState<{ settings: Settings; shifts: Shift[] } | null>(null);
  const [tab, setTab] = useState<Tab>('Today');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // is_admin() also returns false until 2FA is verified for admins who enabled it.
  useEffect(() => {
    if (!session) {
      setIsAdmin(null);
      setRef(null);
      return;
    }
    supabase.rpc('is_admin').then(async ({ data }) => {
      setIsAdmin(data === true);
      if (data === true) setRef(await loadReferenceData());
    });
  }, [session]);

  if (!ready) return null;
  if (!session || isAdmin === false) return <Login notAdmin={isAdmin === false} />;
  if (!ref) return <p className="p-8 text-lg">Loading…</p>;

  return (
    <div className="min-h-screen">
      <header className="bg-[#12355B] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <h1 className="mr-6 text-2xl font-bold">ShiftTrack</h1>
          <nav className="flex flex-1 flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-2 text-lg font-semibold ${tab === t ? 'bg-white text-[#12355B]' : 'hover:bg-white/10'}`}>
                {t}
              </button>
            ))}
          </nav>
          <button onClick={() => supabase.auth.signOut()} className="rounded-lg border border-white/40 px-4 py-2">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        {tab === 'Today' && <Dashboard settings={ref.settings} shifts={ref.shifts} />}
        {tab === 'Employees' && <Employees shifts={ref.shifts} />}
        {tab === 'Payroll' && <Payroll settings={ref.settings} />}
        {tab === 'Security' && <Security />}
      </main>
    </div>
  );
}
