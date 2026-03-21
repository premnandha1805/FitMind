import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Outfit } from '../types/models';
import { FeedbackBar } from './FeedbackBar';
import { ScoreBar } from './ScoreBar';
import { WhyBadge } from './WhyBadge';

interface Props {
  outfit: Outfit;
  onWear: () => void;
  onLike: () => void;
  onSkip: () => void;
  onReject: () => void;
  onWhy: () => void;
}

export function OutfitCard({ outfit, onWear, onLike, onSkip, onReject, onWhy }: Props): React.JSX.Element {
  return (
    <View style={styles.card}>
      <WhyBadge onPress={onWhy} />
      <Text style={styles.title}>{outfit.occasion.toUpperCase()} OUTFIT</Text>
      <Text style={styles.items}>{outfit.itemIds.join(' • ')}</Text>
      <ScoreBar label="Color Harmony" score={outfit.colorScore} />
      <ScoreBar label="Skin Tone Match" score={outfit.skinScore} />
      <ScoreBar label="Your Taste" score={outfit.tasteScore} />
      <ScoreBar label="AI Confidence" score={outfit.geminiScore} />
      <ScoreBar label="Overall" score={outfit.finalScore} />
      <FeedbackBar onWear={onWear} onLike={onLike} onSkip={onSkip} onReject={onReject} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  items: { color: '#475569', marginBottom: 10 },
});
