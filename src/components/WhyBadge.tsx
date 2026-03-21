import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

interface Props {
  onPress: () => void;
}

export function WhyBadge({ onPress }: Props): React.JSX.Element {
  return (
    <Pressable style={styles.btn} onPress={onPress}>
      <Text style={styles.text}>Why this?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#e0f2fe' },
  text: { color: '#0369a1', fontWeight: '700', fontSize: 12 },
});
