import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

interface Props {
  onWear: () => void;
  onLike: () => void;
  onSkip: () => void;
  onReject: () => void;
}

export function FeedbackBar({ onWear, onLike, onSkip, onReject }: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Pressable style={styles.btn} onPress={onWear}><Text>👗 Wear This</Text></Pressable>
      <Pressable style={styles.btn} onPress={onLike}><Text>❤️ Like</Text></Pressable>
      <Pressable style={styles.btn} onPress={onSkip}><Text>⏭️ Skip</Text></Pressable>
      <Pressable style={styles.btn} onPress={onReject}><Text>👎 Not For Me</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#e2e8f0' },
});
