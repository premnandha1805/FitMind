import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  score: number;
}

export function ScoreBar({ label, score }: Props): React.JSX.Element {
  const safe = Math.max(0, Math.min(10, score));
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${safe * 10}%` }]} />
        </View>
        <Text style={styles.value}>{safe.toFixed(0)}/10</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { fontWeight: '600', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 10, borderRadius: 8, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  fill: { height: 10, backgroundColor: '#1f7a8c' },
  value: { width: 42, textAlign: 'right', color: '#334155' },
});
