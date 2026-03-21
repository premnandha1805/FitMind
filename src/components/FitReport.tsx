import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FitCheckResult } from '../types/models';

interface Props {
  report: FitCheckResult;
  onSwapReject: (itemType: string) => void;
  onSwapUse: () => void;
}

export function FitReport({ report, onSwapReject, onSwapUse }: Props): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>1. Skin Tone Match - {report.skin_tone_match.score}/10</Text>
      <Text>{report.skin_tone_match.verdict}: {report.skin_tone_match.reason}</Text>
      <Text style={styles.h}>2. Color Harmony - {report.color_harmony.score}/10</Text>
      <Text>{report.color_harmony.verdict}: {report.color_harmony.reason}</Text>
      <Text style={styles.h}>3. Proportion - {report.proportion.score}/10</Text>
      <Text>{report.proportion.verdict}: {report.proportion.reason}</Text>
      <Text style={styles.h}>4. Color Tips</Text>
      {report.color_tips.map((tip) => <Text key={tip}>• {tip}</Text>)}
      <Text style={styles.h}>5. Styling Tips</Text>
      {report.styling_tips.map((tip) => <Text key={tip}>• {tip}</Text>)}
      <Text style={styles.h}>6. Swap Suggestions</Text>
      {report.swap_suggestions.map((s) => (
        <View key={`${s.item_type}-${s.color}`} style={styles.swap}>
          <Text>{s.item_type} ({s.color}) - {s.reason}</Text>
          <View style={styles.actions}>
            <Pressable onPress={onSwapUse} style={styles.btn}><Text>Use This Swap</Text></Pressable>
            <Pressable onPress={() => onSwapReject(s.item_type)} style={styles.btn}><Text>Not for me</Text></Pressable>
          </View>
        </View>
      ))}
      <Text style={styles.h}>7. Style Score</Text>
      <Text style={styles.big}>{report.style_score}/10</Text>
      <Text style={styles.h}>8. One-line verdict</Text>
      <Text style={styles.verdict}>{report.one_line_verdict}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 4 },
  h: { marginTop: 10, fontWeight: '700', color: '#0f172a' },
  big: { fontSize: 28, fontWeight: '900', color: '#0f766e' },
  verdict: { fontStyle: 'italic', fontWeight: '700' },
  swap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 8, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { backgroundColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
});
