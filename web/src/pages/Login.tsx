import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Email + password sign-in, followed by a TOTP step for admins who enabled 2FA. */
export default function Login({ notAdmin }: { notAdmin: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // A signed-in user who is "not admin" may simply still need the 2FA step.
  useEffect(() => {
    if (!notAdmin) return;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setNeedsCode(data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2');
    });
  }, [notAdmin]);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError('Wrong email or password.');
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp.find((f) => f.status === 'verified');
    const res = factor ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() }) : null;
    setBusy(false);
    if (!res || res.error) setError('Invalid code. Try again.');
  };

  const input = 'w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-lg focus:border-[#12355B] focus:outline-none';
  const button = 'w-full rounded-lg bg-[#12355B] py-3 text-lg font-semibold text-white disabled:opacity-50';

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow">
        <h1 className="mb-6 text-3xl font-bold text-[#12355B]">Atteno_Sync Admin</h1>
        {needsCode ? (
          <form onSubmit={verify} className="space-y-4">
            <label className="block text-lg">Enter the 6-digit code from your authenticator app</label>
            <input className={input} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            <button className={button} disabled={busy || code.length !== 6}>Verify</button>
          </form>
        ) : notAdmin ? (
          <p className="text-lg">This account does not have admin access.</p>
        ) : (
          <form onSubmit={signIn} className="space-y-4">
            <input className={input} type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={input} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className={button} disabled={busy || !email || !password}>Sign in</button>
          </form>
        )}
        {error && <p className="mt-4 text-lg font-semibold text-red-700">{error}</p>}
        {notAdmin && (
          <button onClick={() => supabase.auth.signOut()} className="mt-4 w-full text-lg text-gray-600 underline">
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}


