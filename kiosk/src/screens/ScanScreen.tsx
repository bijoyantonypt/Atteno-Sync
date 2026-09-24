// "Place your finger" prompt shown while the native module waits for a capture.
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, Label } from '../components/ui';

export function ScanScreen() {
  return (
    <View style={styles.screen}>
      <Label k="placeFinger" size={36} />
      <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 40, transform: [{ scale: 2 }] }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
