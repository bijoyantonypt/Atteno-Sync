// Confirmation ("Clocked In at 8:02 AM") or error message; returns home automatically.
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RESULT_SCREEN_SECONDS, SHOW_HINDI } from '../config';
import { formatTime, StringKey } from '../i18n';
import { ClockOutcome } from '../services/clock';
import { colors, Label } from '../components/ui';

export type ResultProps = { kind: 'success'; outcome: ClockOutcome } | { kind: 'error'; errorKey: StringKey };

export function ResultScreen(props: ResultProps & { onDone: () => void }) {
  const { onDone } = props;
  useEffect(() => {
    const id = setTimeout(onDone, RESULT_SCREEN_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [onDone]);

  if (props.kind === 'error') {
    return (
      <Pressable style={[styles.screen, { backgroundColor: '#FDECEA' }]} onPress={onDone}>
        <Text style={[styles.icon, { color: colors.absent }]}>✕</Text>
        <Label k={props.errorKey} size={30} color={colors.absent} />
      </Pressable>
    );
  }

  const { outcome } = props;
  const time = formatTime(outcome.capturedAt);
  const accent = outcome.wasLate ? colors.late : colors.onTime;
  return (
    <Pressable style={[styles.screen, { backgroundColor: '#E8F5EC' }]} onPress={onDone}>
      <Text style={[styles.icon, { color: accent }]}>✓</Text>
      <Text style={styles.name}>{outcome.employee.full_name}</Text>
      {SHOW_HINDI && !!outcome.employee.full_name_hi && <Text style={styles.nameHi}>{outcome.employee.full_name_hi}</Text>}
      <Label k={outcome.eventType === 'in' ? 'clockedInAt' : 'clockedOutAt'} vars={{ time }} size={34} color={accent} />
      {outcome.wasLate && <View style={{ marginTop: 12 }}><Label k="late" size={24} color={colors.late} /></View>}
      {!outcome.synced && <View style={{ marginTop: 24 }}><Label k="savedOffline" size={18} color={colors.muted} /></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon: { fontSize: 120, fontWeight: '900' },
  name: { fontSize: 36, fontWeight: '800', color: colors.text, textAlign: 'center' },
  nameHi: { fontSize: 26, color: colors.text, marginBottom: 16, textAlign: 'center' },
});
