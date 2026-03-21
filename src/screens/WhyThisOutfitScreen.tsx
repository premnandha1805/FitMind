import React from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useOutfitStore } from '../store/useOutfitStore';
import { ScoreBar } from '../components/ScoreBar';
import { useTasteStore } from '../store/useTasteStore';

type Props = StackScreenProps<RootStackParamList, 'WhyThisOutfit'>;

export default function WhyThisOutfitScreen({ route }: Props): React.JSX.Element {
  const outfit = useOutfitStore((s) => s.outfits.find((x) => x.id === route.params.outfitId));
  const profile = useTasteStore((s) => s.profile);

  if (!outfit) {
    return <View style={styles.container}><Text>Outfit not found.</Text></View>;
  }

  const interactions = profile?.feedbackCount ?? 0;
  const nextIn = 5 - (interactions % 5 || 5);
  const progress = ((interactions % 5) / 5) * 100;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Why we picked this for you</Text>
      <ScoreBar label="Color Harmony" score={outfit.colorScore} />
      <ScoreBar label="Skin Tone Match" score={outfit.skinScore} />
      <ScoreBar label="Your Taste" score={outfit.tasteScore} />
      <ScoreBar label="AI Confidence" score={outfit.geminiScore} />
      <ScoreBar label="Overall" score={outfit.finalScore} />

      <Text style={styles.section}>Reasons</Text>
      {outfit.reasons.map((reason) => <Text key={reason}>✅ {reason}</Text>)}

      <Text style={styles.section}>Learning status</Text>
      <Text>Based on {interactions} outfits you have interacted with</Text>
      <Text>Recommendations improve every 5 interactions</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
      <Text>Next improvement in {nextIn} interactions</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 10 },
  section: { marginTop: 12, marginBottom: 6, fontWeight: '800' },
  track: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 8, marginTop: 8, marginBottom: 8 },
  fill: { height: 10, backgroundColor: '#1f7a8c', borderRadius: 8 },
});
