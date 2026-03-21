import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  toneName: string;
  undertone: string;
  hex: string;
}

export function SkinToneBadge({ toneName, undertone, hex }: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: hex }]} />
      <View>
        <Text style={styles.title}>{toneName}</Text>
        <Text style={styles.sub}>Undertone: {undertone}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: '#f8fafc' },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#cbd5e1' },
  title: { fontWeight: '700', color: '#0f172a' },
  sub: { color: '#475569' },
});
