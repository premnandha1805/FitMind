import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>FitMind</Text>
      <Text style={styles.tagline}>Your AI stylist. Your wardrobe. Your rules.</Text>
      <Pressable style={styles.cta} onPress={() => navigation.navigate('SkinTone')}>
        <Text style={styles.ctaText}>Get Started</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', padding: 24 },
  brand: { fontSize: 42, fontWeight: '900', color: '#0f172a' },
  tagline: { marginTop: 12, color: '#334155', fontSize: 16 },
  cta: { marginTop: 28, backgroundColor: '#0f766e', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
