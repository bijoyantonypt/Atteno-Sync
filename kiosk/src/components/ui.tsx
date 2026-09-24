import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SHOW_HINDI } from '../config';
import { StringKey, t } from '../i18n';

export const colors = {
  bg: '#FFFFFF',
  text: '#111111',
  muted: '#4A4A4A',
  onTime: '#0B7A32', // green
  late: '#C25E00', // orange
  absent: '#B3261E', // red
  primary: '#0B7A32',
  secondary: '#12355B',
  neutral: '#E6E6E6',
};

/** English line with optional Hindi line underneath. */
export function Label({ k, vars, size = 22, color = colors.text, center = true }: {
  k: StringKey;
  vars?: Record<string, string | number>;
  size?: number;
  color?: string;
  center?: boolean;
}) {
  const s = t(k, vars);
  const align = center ? 'center' : 'left';
  return (
    <View>
      <Text style={{ fontSize: size, fontWeight: '700', color, textAlign: align }}>{s.en}</Text>
      {SHOW_HINDI && <Text style={{ fontSize: size * 0.7, color, textAlign: align }}>{s.hi}</Text>}
    </View>
  );
}

export function BigButton({ k, color, onPress, disabled }: {
  k: StringKey;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(k).en}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: color, opacity: pressed || disabled ? 0.7 : 1 }]}>
      <Label k={k} size={34} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 130,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 16,
  },
});
