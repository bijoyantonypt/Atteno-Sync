// ShiftTrack kiosk entry point. Simple state-based navigation (no router dependency).
import NetInfo from '@react-native-community/netinfo';
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { errorKey } from './src/i18n';
import { scanner } from './src/native/scanner';
import { fetchHistory, HistoryResponse, syncRoster } from './src/services/api';
import { clock, ClockError } from './src/services/clock';
import { flushQueue, pendingCount } from './src/services/queue';
import { store } from './src/services/store';
import { AdminScreen } from './src/screens/AdminScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ResultProps, ResultScreen } from './src/screens/ResultScreen';
import { ScanScreen } from './src/screens/ScanScreen';

type Screen =
  | { name: 'home' }
  | { name: 'scan' }
  | { name: 'result'; props: ResultProps }
  | { name: 'history'; data: HistoryResponse }
  | { name: 'admin' };

const SYNC_INTERVAL_MS = 60_000;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  // Background sync: flush the offline queue and refresh the roster when online.
  const sync = useCallback(async () => {
    const deviceId = await store.getDeviceId();
    if (deviceId) {
      await flushQueue(deviceId);
      await syncRoster(deviceId).catch(() => undefined);
    }
    setPending(await pendingCount());
  }, []);

  useEffect(() => {
    sync();
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline) sync();
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [sync]);

  const goHome = useCallback(() => {
    setScreen({ name: 'home' });
    pendingCount().then(setPending);
  }, []);

  const showError = (e: unknown) => setScreen({ name: 'result', props: { kind: 'error', errorKey: errorKey(e) } });

  const handleClock = async (type: 'in' | 'out') => {
    setScreen({ name: 'scan' });
    try {
      const outcome = await clock(type);
      setScreen({ name: 'result', props: { kind: 'success', outcome } });
    } catch (e) {
      showError(e);
    }
  };

  // History requires a fingerprint match too, so nobody can view another person's records.
  const handleHistory = async () => {
    setScreen({ name: 'scan' });
    try {
      const deviceId = await store.getDeviceId();
      if (!deviceId) throw new ClockError('DEVICE_NOT_REGISTERED');
      const { employeeId } = await scanner.identify();
      setScreen({ name: 'history', data: await fetchHistory(deviceId, employeeId) });
    } catch (e) {
      showError(e);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {screen.name === 'home' && (
        <HomeScreen
          online={online}
          pending={pending}
          onClock={handleClock}
          onHistory={handleHistory}
          onAdmin={() => setScreen({ name: 'admin' })}
        />
      )}
      {screen.name === 'scan' && <ScanScreen />}
      {screen.name === 'result' && <ResultScreen {...screen.props} onDone={goHome} />}
      {screen.name === 'history' && <HistoryScreen data={screen.data} onBack={goHome} />}
      {screen.name === 'admin' && <AdminScreen onExit={goHome} />}
    </SafeAreaView>
  );
}
