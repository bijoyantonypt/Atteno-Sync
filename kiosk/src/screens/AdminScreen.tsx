// Supervisor mode: sign in, pair this kiosk, enrol / remove employee fingerprints.
// Reached by long-pressing the title on the home screen for 3 seconds.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { onScannerPrompt, scanner } from '../native/scanner';
import { adminSignIn, ApiError, recordEnrollment, registerDevice, syncRoster, verifyTotp } from '../services/api';
import { flushQueue, pendingCount } from '../services/queue';
import { RosterEmployee, store } from '../services/store';
import { colors } from '../components/ui';

function Button({ title, onPress, color = colors.secondary, disabled }: {
  title: string; onPress: () => void; color?: string; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.btn, { backgroundColor: color, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={styles.btnText}>{title}</Text>
    </Pressable>
  );
}

export function AdminScreen({ onExit }: { onExit: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEmployee[]>([]);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    const id = await store.getDeviceId();
    setDeviceId(id);
    if (id) await syncRoster(id).catch(() => undefined);
    setRoster(await store.getRoster());
    setEnrolled(new Set(await scanner.enrolledIds()));
    setPending(await pendingCount());
  }, []);

  useEffect(() => {
    refresh();
    return onScannerPrompt((p) => {
      if (p.type === 'ENROLL_PLACE') setPrompt(`Place finger (${p.step}/3)`);
      if (p.type === 'ENROLL_LIFT') setPrompt(`Lift finger (${p.step}/3)`);
    });
  }, [refresh]);

  const fail = (e: unknown) => Alert.alert('Error', (e as Error).message ?? String(e));

  // Admin 2FA is enforced server-side; retry once with a TOTP code when required.
  const withAdmin = async (action: (t: string) => Promise<unknown>) => {
    try {
      await action(token!);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && /two-factor/i.test(e.message)) setNeedsTotp(true);
      throw e;
    }
  };

  const signIn = async () => {
    setBusy('login');
    try {
      setToken(await adminSignIn(email.trim(), password));
      setPassword('');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const submitTotp = async () => {
    try {
      setToken(await verifyTotp(token!, totp.trim()));
      setNeedsTotp(false);
      setTotp('');
    } catch (e) {
      fail(e);
    }
  };

  const pairKiosk = async () => {
    setBusy('pair');
    try {
      await withAdmin(async (t) => {
        const { device_id } = await registerDevice(t, 'Factory kiosk', await scanner.devicePublicKey());
        await store.setDeviceId(device_id);
      });
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const enrol = async (emp: RosterEmployee) => {
    setBusy(emp.id);
    try {
      const { templateHash } = await scanner.enroll(emp.id);
      await withAdmin((t) => recordEnrollment(t, emp.id, templateHash));
      Alert.alert('Enrolled', `${emp.full_name} can now clock in.`);
    } catch (e) {
      fail(e);
    } finally {
      setPrompt('');
      setBusy(null);
      setEnrolled(new Set(await scanner.enrolledIds()));
    }
  };

  const remove = (emp: RosterEmployee) =>
    Alert.alert('Remove fingerprint?', emp.full_name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await scanner.deleteTemplate(emp.id);
            await withAdmin((t) => recordEnrollment(t, emp.id, null));
          } catch (e) {
            fail(e);
          }
          setEnrolled(new Set(await scanner.enrolledIds()));
        },
      },
    ]);

  if (!token) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Supervisor sign-in</Text>
        <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Button title="Sign in" onPress={signIn} disabled={busy !== null || !email || !password} />
        <Button title="Back" color={colors.muted} onPress={onExit} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Kiosk setup</Text>
      {needsTotp && (
        <View style={styles.card}>
          <Text style={styles.text}>Enter the 6-digit code from your authenticator app</Text>
          <TextInput style={styles.input} keyboardType="number-pad" maxLength={6} value={totp} onChangeText={setTotp} />
          <Button title="Verify" onPress={submitTotp} disabled={totp.length !== 6} />
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.text}>Device: {deviceId ?? 'not paired'}</Text>
        <Text style={styles.text}>Events waiting to sync: {pending}</Text>
        {!deviceId && <Button title="Pair this kiosk" onPress={pairKiosk} disabled={busy !== null} />}
        {deviceId && (
          <Button title="Sync now" onPress={async () => { await flushQueue(deviceId); await refresh(); }} />
        )}
      </View>
      {!!prompt && <Text style={styles.prompt}>{prompt}</Text>}
      <FlatList
        data={roster}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.text}>{item.employee_code} · {item.full_name}</Text>
              <Text style={{ color: enrolled.has(item.id) ? colors.onTime : colors.absent }}>
                {enrolled.has(item.id) ? 'Fingerprint enrolled' : 'Not enrolled'}
              </Text>
            </View>
            <Button title={enrolled.has(item.id) ? 'Re-enrol' : 'Enrol'} onPress={() => enrol(item)} disabled={busy !== null} />
            {enrolled.has(item.id) && <Button title="Remove" color={colors.absent} onPress={() => remove(item)} disabled={busy !== null} />}
          </View>
        )}
      />
      <Button title="Exit supervisor mode" color={colors.muted} onPress={onExit} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 12, color: colors.text },
  input: { borderWidth: 2, borderColor: colors.neutral, borderRadius: 10, padding: 12, fontSize: 20, marginBottom: 12, color: colors.text },
  card: { backgroundColor: '#F4F6F8', borderRadius: 12, padding: 12, marginBottom: 12 },
  text: { fontSize: 18, color: colors.text },
  prompt: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: colors.secondary, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.neutral },
  btn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, marginVertical: 4, marginLeft: 6, alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
