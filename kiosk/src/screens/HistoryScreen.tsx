// Attendance history + latest pay slip for the employee identified by fingerprint.
import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { HISTORY_SCREEN_SECONDS } from '../config';
import { formatDate, formatTime } from '../i18n';
import { HistoryDay, HistoryResponse } from '../services/api';
import { colors, Label } from '../components/ui';

const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

function DayRow({ day }: { day: HistoryDay }) {
  const color = day.status === 'missing_out' ? colors.absent : day.was_late ? colors.late : colors.onTime;
  return (
    <View style={[styles.row, { borderLeftColor: color }]}>
      <Text style={styles.date}>{formatDate(day.work_date)}</Text>
      <Text style={styles.cell}>
        {day.first_in ? formatTime(day.first_in) : '--'} → {day.last_out ? formatTime(day.last_out) : '--'}
      </Text>
      <View style={styles.rowFooter}>
        {day.status === 'missing_out'
          ? <Label k="missingOut" size={16} color={colors.absent} center={false} />
          : <Text style={styles.cell}>{hours(day.worked_minutes)}</Text>}
        {day.overtime_minutes > 0 && (
          <Text style={[styles.cell, { color: colors.secondary }]}>+{hours(day.overtime_minutes)} OT</Text>
        )}
      </View>
    </View>
  );
}

export function HistoryScreen({ data, onBack }: { data: HistoryResponse; onBack: () => void }) {
  useEffect(() => {
    const id = setTimeout(onBack, HISTORY_SCREEN_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [onBack]);

  const slip = data.latest_payslip;
  const money = (n: number) => `${data.currency} ${Number(n).toFixed(2)}`;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{data.employee.full_name}</Text>
      {slip && (
        <View style={styles.slip}>
          <Label k="latestPay" size={18} center={false} />
          <Text style={styles.cell}>{String(slip.month).padStart(2, '0')}/{slip.year} · {slip.days_worked} days · {slip.overtime_hours}h OT</Text>
          <Text style={styles.total}>{money(slip.total_pay)}</Text>
        </View>
      )}
      <FlatList
        data={data.days}
        keyExtractor={(d) => d.work_date}
        renderItem={({ item }) => <DayRow day={item} />}
        ListEmptyComponent={<Label k="noRecords" size={20} />}
      />
      <Pressable style={styles.back} onPress={onBack} accessibilityRole="button">
        <Label k="back" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { fontSize: 30, fontWeight: '800', color: colors.text, marginBottom: 8 },
  slip: { backgroundColor: '#EEF3F8', borderRadius: 12, padding: 12, marginBottom: 12 },
  total: { fontSize: 28, fontWeight: '800', color: colors.secondary },
  row: { borderLeftWidth: 8, backgroundColor: '#F7F7F7', borderRadius: 8, padding: 12, marginBottom: 8 },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  date: { fontSize: 20, fontWeight: '700', color: colors.text },
  cell: { fontSize: 18, color: colors.text },
  back: { backgroundColor: colors.secondary, borderRadius: 16, padding: 16, marginTop: 8 },
});
