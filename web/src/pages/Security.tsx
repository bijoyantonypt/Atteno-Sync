import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Optional TOTP 2FA enrolment (Google Authenticator, Aegis, etc.). */
export default function Security() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [enrolment, setEnrolment] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setEnabled((data?.totp ?? []).some((f) => f.status === 'verified'));
  };
  useEffect(() => {
    refresh();
  }, []);

  const start = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Atteno_Sync ${Date.now()}` });
    if (error) return setMessage(error.message);
    setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirm = async () => {
    if (!enrolment) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code: code.trim() });
    if (error) return setMessage('Invalid code. Try again.');
    setEnrolment(null);
    setCode('');
    setMessage('Two-factor sign-in is now on.');
    refresh();
  };

  return (
    <section className="max-w-lg rounded-2xl bg-white p-6 shadow">
      <h2 className="mb-2 text-2xl font-bold">Two-factor sign-in</h2>
      {enabled === null ? null : enabled ? (
        <p className="text-lg text-green-800">On. You will be asked for a 6-digit code at every sign-in.</p>
      ) : enrolment ? (
        <div className="space-y-4">
          <p className="text-lg">Scan this QR code with your authenticator app, then enter the code.</p>
          <img src={enrolment.qr} alt="Authenticator QR code" className="h-48 w-48" />
          <p className="break-all text-sm text-gray-600">Manual key: {enrolment.secret}</p>
          <input className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-lg" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          <button onClick={confirm} disabled={code.length !== 6} className="rounded-lg bg-[#12355B] px-6 py-3 text-lg font-semibold text-white disabled:opacity-50">
            Turn on
          </button>
        </div>
      ) : (
        <button onClick={start} className="rounded-lg bg-[#12355B] px-6 py-3 text-lg font-semibold text-white">
          Set up authenticator app
        </button>
      )}
      {message && <p className="mt-4 text-lg">{message}</p>}
    </section>
  );
}


