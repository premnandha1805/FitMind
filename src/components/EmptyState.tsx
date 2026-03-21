import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
  subtitle: string;
}

export function EmptyState({ title, subtitle }: Props): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 24, marginTop: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  subtitle: { marginTop: 8, textAlign: 'center', color: '#475569' },
});
