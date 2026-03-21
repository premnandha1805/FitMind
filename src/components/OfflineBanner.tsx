import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
}

export function OfflineBanner({ visible }: Props): React.JSX.Element | null {
  if (!visible) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You are offline. Fit Check is disabled, everything else still works.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#fff4e5', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#fed7aa' },
  text: { color: '#9a3412', fontSize: 12, fontWeight: '600' },
});
