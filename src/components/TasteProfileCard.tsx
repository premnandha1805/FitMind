import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TasteProfile } from '../types/models';

interface Props {
  profile: TasteProfile;
}

export function TasteProfileCard({ profile }: Props): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.h}>Taste Engine</Text>
      <Text>Contrast: {(profile.contrastPreference * 100).toFixed(0)}%</Text>
      <Text>Warm/Cool Bias: {(profile.warmCoolBias * 100).toFixed(0)}%</Text>
      <Text>Pattern Tolerance: {(profile.patternTolerance * 100).toFixed(0)}%</Text>
      <Text>Boldness: {(profile.boldnessPreference * 100).toFixed(0)}%</Text>
      <Text>Feedback Count: {profile.feedbackCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  h: { fontWeight: '800', marginBottom: 8 },
});
