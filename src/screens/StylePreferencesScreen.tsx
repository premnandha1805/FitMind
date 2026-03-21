import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { ColorSwatch } from '../components/ColorSwatch';
import { RootStackParamList } from '../navigation/types';
import { useUserStore } from '../store/useUserStore';

type Props = StackScreenProps<RootStackParamList, 'StylePreferences'>;

const palette = ['#1b2a49', '#7a1f3d', '#0f8b5f', '#ff7f50', '#d4a017', '#008080', '#000000', '#ffffff'];

export default function StylePreferencesScreen({ navigation }: Props): React.JSX.Element {
  const savePreferences = useUserStore((s) => s.savePreferences);
  const profile = useUserStore((s) => s.profile);
  const saveProfile = useUserStore((s) => s.saveProfile);
  const [lovedColors, setLovedColors] = useState<string[]>([]);
  const [patternMode, setPatternMode] = useState<'solid' | 'subtle' | 'bold' | 'all'>('solid');
  const [fitPreference, setFitPreference] = useState<'relaxed' | 'fitted'>('relaxed');
  const [styleIdentity, setStyleIdentity] = useState<'minimal' | 'classic' | 'bold' | 'traditional'>('classic');

  const lovedPatterns = useMemo(() => {
    if (patternMode === 'all') return ['solid', 'subtle', 'bold'];
    if (patternMode === 'solid') return ['solid'];
    if (patternMode === 'subtle') return ['subtle'];
    return ['bold'];
  }, [patternMode]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Tell us your style - takes 30 seconds</Text>
      <Text style={styles.section}>Colors you love</Text>
      <View style={styles.rowWrap}>
        {palette.map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            selected={lovedColors.includes(color)}
            onPress={() => setLovedColors((prev) => prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color])}
          />
        ))}
      </View>

      <Text style={styles.section}>Patterns you wear</Text>
      <View style={styles.rowWrap}>
        {[
          ['solid', 'Solid only'],
          ['subtle', 'Subtle prints'],
          ['bold', 'Bold patterns'],
          ['all', 'All patterns'],
        ].map(([value, label]) => (
          <Pressable key={value} style={[styles.choice, patternMode === value && styles.choiceOn]} onPress={() => setPatternMode(value as typeof patternMode)}><Text>{label}</Text></Pressable>
        ))}
      </View>

      <Text style={styles.section}>Your fit preference</Text>
      <View style={styles.rowWrap}>
        <Pressable style={[styles.choice, fitPreference === 'relaxed' && styles.choiceOn]} onPress={() => setFitPreference('relaxed')}><Text>Relaxed and comfortable</Text></Pressable>
        <Pressable style={[styles.choice, fitPreference === 'fitted' && styles.choiceOn]} onPress={() => setFitPreference('fitted')}><Text>Fitted and sharp</Text></Pressable>
      </View>

      <Text style={styles.section}>Your style identity</Text>
      <View style={styles.rowWrap}>
        {['minimal', 'classic', 'bold', 'traditional'].map((style) => (
          <Pressable key={style} style={[styles.choice, styleIdentity === style && styles.choiceOn]} onPress={() => setStyleIdentity(style as typeof styleIdentity)}><Text>{style}</Text></Pressable>
        ))}
      </View>

      <Pressable style={styles.save} onPress={async () => {
        await savePreferences({
          lovedColors,
          dislikedColors: [],
          lovedPatterns,
          dislikedPatterns: [],
          fitPreference,
          styleIdentity,
        });
        if (profile) {
          await saveProfile({
            skinToneId: profile.skinToneId,
            skinUndertone: profile.skinUndertone,
            skinImagePath: profile.skinImagePath,
            onboarded: 1,
          });
        }
        navigation.navigate('ClosetIntro');
      }}><Text style={styles.saveText}>Save</Text></Pressable>

      <Pressable onPress={async () => {
        await savePreferences({ lovedColors: [], dislikedColors: [], lovedPatterns: [], dislikedPatterns: [], fitPreference: 'relaxed', styleIdentity: 'classic' });
        if (profile) {
          await saveProfile({
            skinToneId: profile.skinToneId,
            skinUndertone: profile.skinUndertone,
            skinImagePath: profile.skinImagePath,
            onboarded: 1,
          });
        }
        navigation.navigate('ClosetIntro');
      }}><Text style={styles.skip}>Skip</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  section: { marginTop: 16, marginBottom: 8, fontWeight: '700' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { backgroundColor: '#e2e8f0', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10 },
  choiceOn: { backgroundColor: '#99f6e4' },
  save: { marginTop: 20, backgroundColor: '#0f766e', borderRadius: 12, padding: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
  skip: { marginTop: 12, color: '#0369a1', textAlign: 'center' },
});
