import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, ToastAndroid } from 'react-native';
import { NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { ColorSwatch } from '../components/ColorSwatch';
import { SkinToneBadge } from '../components/SkinToneBadge';
import { TasteProfileCard } from '../components/TasteProfileCard';
import { useUserStore } from '../store/useUserStore';
import { executeSqlWithRetry, getAll, getOne } from '../db/queries';
import { detectTasteInsights, getLearningProgress, recalculateTasteWeights } from '../services/feedbackEngine';
import { getTasteProfile } from '../services/tasteEngine';
import { safeAsync } from '../utils/safeAsync';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { TasteInsight, TasteProfile } from '../types/models';

const palette = ['#1b2a49', '#7a1f3d', '#0f8b5f', '#ff7f50', '#d4a017', '#008080', '#000000', '#ffffff'];

export default function ProfileScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp<RootStackParamList & MainTabParamList>>();
  const user = useUserStore((s) => s.profile);
  const savePreferences = useUserStore((s) => s.savePreferences);

  const [blocked, setBlocked] = useState<Array<{ id: string; pattern_type: string }>>([]);
  const [lovedColors, setLovedColors] = useState<string[]>([]);
  const [dislikedColors, setDislikedColors] = useState<string[]>([]);
  const [insights, setInsights] = useState<TasteInsight[]>([]);
  const [learningProgress, setLearningProgress] = useState<{ count: number; nextMilestone: number; accuracyTrend: 'improving' | 'stable' } | null>(null);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);

  const showToast = (message: string): void => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert('FitMind', message);
  };

  useFocusEffect(
    useCallback(() => {
      safeAsync(async () => {
        const [rows, loadedInsights, progress, tasteRow, prefRow] = await Promise.all([
          getAll<{ id: string; pattern_type: string }>('SELECT id, pattern_type FROM blocked_patterns ORDER BY blocked_at DESC;'),
          detectTasteInsights(),
          getLearningProgress(),
          getTasteProfile(),
          getOne<{ loved_colors: string; disliked_colors: string }>('SELECT loved_colors, disliked_colors FROM explicit_preferences WHERE id = ?;', ['prefs']),
        ]);

        const rawFeedbackCount = await getOne<{ feedback_count: number }>('SELECT feedback_count FROM taste_profile WHERE id = ?;', ['taste']);
        const count = rawFeedbackCount?.feedback_count ?? 0;

        setBlocked(rows);
        setInsights(loadedInsights.slice(0, 5));
        setLearningProgress(progress);
        setTasteProfile(tasteRow);
        setFeedbackCount(count);
        setLovedColors(JSON.parse(prefRow?.loved_colors ?? '[]') as string[]);
        setDislikedColors(JSON.parse(prefRow?.disliked_colors ?? '[]') as string[]);
      }, 'ProfileScreen.focusLoad');
    }, [])
  );

  const interactions = learningProgress?.count ?? 0;
  const nextMilestone = learningProgress?.nextMilestone ?? 5;
  const previousMilestone = Math.max(0, nextMilestone - 5);
  const progressValue = Math.min(100, Math.max(0, ((interactions - previousMilestone) / 5) * 100));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <Text style={styles.section}>1. Skin Tone</Text>
      {user ? <SkinToneBadge toneName={`Tone ${user.skinToneId}`} undertone={user.skinUndertone} hex="#c8a27a" /> : <Text>Set your skin tone in onboarding.</Text>}
      <Pressable style={styles.link} onPress={() => navigation.navigate('SkinTone', { returnToProfile: true })}>
        <Text style={styles.linkText}>Retake skin tone photo</Text>
      </Pressable>

      <Text style={styles.section}>2. My Style Preferences</Text>
      <Text style={styles.sub}>Colors I love</Text>
      <View style={styles.swatches}>{palette.map((c) => <ColorSwatch key={c} color={c} selected={lovedColors.includes(c)} onPress={() => setLovedColors((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])} />)}</View>
      <Text style={styles.sub}>Colors I dislike</Text>
      <View style={styles.swatches}>{palette.map((c) => <ColorSwatch key={`d-${c}`} color={c} selected={dislikedColors.includes(c)} onPress={() => setDislikedColors((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])} />)}</View>
      <Pressable style={styles.save} onPress={async () => {
        await savePreferences({
          lovedColors,
          dislikedColors,
          lovedPatterns: tasteProfile?.lovedPatterns ?? [],
          dislikedPatterns: tasteProfile?.dislikedPatterns ?? [],
          fitPreference: tasteProfile?.fitPreference ?? 'relaxed',
          styleIdentity: tasteProfile?.styleIdentity ?? 'classic',
        });
        await recalculateTasteWeights();
        showToast('Preferences saved and style weights updated.');
      }}><Text style={styles.saveText}>Save</Text></Pressable>

      <Text style={styles.section}>3. My Style Insights</Text>
      {feedbackCount < 5 ? (
        <Text style={styles.placeholder}>Interact with more outfits to unlock insights</Text>
      ) : (
        insights.slice(0, 5).map((i) => <Text key={i.id}>• {i.text}</Text>)
      )}

      <Text style={styles.section}>4. Blocked Patterns</Text>
      {!blocked.length ? <Text style={styles.placeholder}>No blocked patterns.</Text> : null}
      {blocked.map((b) => (
        <View key={b.id} style={styles.blockedRow}>
          <Text>{b.pattern_type}</Text>
          <Pressable onPress={async () => {
            await executeSqlWithRetry('DELETE FROM blocked_patterns WHERE id = ?;', [b.id]);
            const rows = await getAll<{ id: string; pattern_type: string }>('SELECT id, pattern_type FROM blocked_patterns ORDER BY blocked_at DESC;');
            setBlocked(rows);
            showToast('Pattern unblocked.');
          }}><Text style={styles.unlink}>Unblock</Text></Pressable>
        </View>
      ))}

      <Text style={styles.section}>5. Learning Progress</Text>
      <Text>Total interactions: {interactions}</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${progressValue}%` }]} /></View>
      {interactions < 10 ? <Text style={styles.placeholder}>Building baseline...</Text> : <Text>Accuracy trend: {learningProgress?.accuracyTrend ?? 'stable'}</Text>}
      <Text>Your taste profile updates every 5 interactions</Text>
      <Text>Next milestone: {nextMilestone}</Text>

      {tasteProfile ? <TasteProfileCard profile={tasteProfile} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '900' },
  section: { marginTop: 16, marginBottom: 8, fontWeight: '800', color: '#0f172a' },
  sub: { marginTop: 8, fontWeight: '700' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap' },
  link: { marginTop: 8 },
  linkText: { color: '#0369a1' },
  save: { marginTop: 10, backgroundColor: '#0f766e', borderRadius: 10, padding: 10, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
  blockedRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  unlink: { color: '#dc2626', fontWeight: '700' },
  placeholder: { color: '#64748b' },
  track: { height: 10, borderRadius: 8, backgroundColor: '#e2e8f0', marginVertical: 8 },
  fill: { height: 10, borderRadius: 8, backgroundColor: '#0f766e' },
});
