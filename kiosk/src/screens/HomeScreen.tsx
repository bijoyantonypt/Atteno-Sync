// Employee home screen: two large actions + attendance history. Long-press the title for admin mode.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime } from '../i18n';
import { BigButton, colors, Label } from '../components/ui';

export function HomeScreen({ online, pending, onClock, onHistory, onAdmin }: {
  online: boolean;
  pending: number;
  onClock: (type: 'in' | 'out') => void;
  onHistory: () => void;
  onAdmin: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.screen}>
      <Pressable onLongPress={onAdmin} delayLongPress={3000} accessibilityRole="header">
        <Label k="appName" size={30} />
      </Pressable>
      <Text style={styles.clock}>{formatTime(now)}</Text>

      <View style={styles.actions}>
        <BigButton k="clockIn" color={colors.primary} onPress={() => onClock('in')} />
        <BigButton k="clockOut" color={colors.secondary} onPress={() => onClock('out')} />
        <BigButton k="myAttendance" color={colors.muted} onPress={onHistory} />
      </View>

      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: online ? colors.onTime : colors.absent }]} />
        <Label k={online ? 'online' : 'offline'} size={16} />
        {pending > 0 && (
          <View style={{ marginLeft: 16 }}>
            <Label k="pending" vars={{ count: pending }} size={16} color={colors.late} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'space-between' },
  clock: { fontSize: 64, fontWeight: '800', textAlign: 'center', color: colors.text },
  actions: { flex: 1, justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, marginRight: 8 },
});
