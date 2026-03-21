import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { OutfitCard } from '../components/OutfitCard';
import { useOutfitStore } from '../store/useOutfitStore';
import { dismissMorningCheckIn, getPendingMorningCheckIn, recordFitCheckRating, recordLiked, recordRejected, recordSkipped, recordWorn } from '../services/feedbackEngine';
import { safeAsync } from '../utils/safeAsync';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { SkeletonCard } from '../components/SkeletonCard';
import { ErrorCard } from '../components/ErrorCard';
import { useClosetStore } from '../store/useClosetStore';
import { useTasteStore } from '../store/useTasteStore';
import { useUserStore } from '../store/useUserStore';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Outfit } from '../types/models';

export default function HomeScreen(): React.JSX.Element {
  const outfits = useOutfitStore((s) => s.outfits);
  const note = useOutfitStore((s) => s.note);
  const loading = useOutfitStore((s) => s.loading);
  const generate = useOutfitStore((s) => s.generate);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const tabNavigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const closetItems = useClosetStore((s) => s.items);
  const tasteProfile = useTasteStore((s) => s.profile);
  const userProfile = useUserStore((s) => s.profile);

  const [visibleOutfits, setVisibleOutfits] = useState<Outfit[]>([]);
  const [autoRegenerated, setAutoRegenerated] = useState(false);
  const [morningOutfitId, setMorningOutfitId] = useState<string | null>(null);
  const rejectAnimations = useRef<Record<string, Animated.Value>>({});

  useEffect(() => {
    safeAsync(async () => {
      const pending = await getPendingMorningCheckIn();
      setMorningOutfitId(pending?.outfitId ?? null);
    }, 'HomeScreen.loadMorningCheckIn');
  }, []);

  useEffect(() => {
    setVisibleOutfits(outfits);
    setAutoRegenerated(false);
    outfits.forEach((outfit) => {
      if (!rejectAnimations.current[outfit.id]) {
        rejectAnimations.current[outfit.id] = new Animated.Value(0);
      }
    });
  }, [outfits]);

  const errorKind = useMemo(() => {
    if (note?.toLowerCase().includes('add at least one top and one bottom')) {
      return 'noTopsOrBottoms';
    }
    if (note?.toLowerCase().includes('closest')) {
      return 'noMatches';
    }
    if (note?.toLowerCase().includes('still learning your taste')) {
      return 'allBlocked';
    }
    return null;
  }, [note]);

  const handleReject = (outfitId: string): void => {
    const value = rejectAnimations.current[outfitId] ?? new Animated.Value(0);
    rejectAnimations.current[outfitId] = value;

    Animated.timing(value, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start(() => {
      setVisibleOutfits((prev) => {
        const updated = prev.filter((o) => o.id !== outfitId);
        if (updated.length === 0 && prev.length > 0 && !autoRegenerated) {
          setAutoRegenerated(true);
          safeAsync(async () => {
            if (!userProfile || !tasteProfile) return;
            const occasion = outfits[0]?.occasion ?? 'casual';
            await generate(occasion, closetItems, userProfile, tasteProfile);
          }, 'HomeScreen.autoRegenerateOutfits');
        }
        return updated;
      });
    });

    safeAsync(async () => recordRejected(outfitId), 'HomeScreen.recordRejected');
  };

  const onMorningRate = (rating: 'loved' | 'fine' | 'notGreat'): void => {
    if (!morningOutfitId) return;
    safeAsync(async () => {
      await recordFitCheckRating(morningOutfitId, rating);
      await dismissMorningCheckIn(morningOutfitId);
    }, 'HomeScreen.onMorningRate');
    setMorningOutfitId(null);
  };

  const onMorningDismiss = (): void => {
    if (!morningOutfitId) return;
    safeAsync(async () => dismissMorningCheckIn(morningOutfitId), 'HomeScreen.dismissMorning');
    setMorningOutfitId(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Today&apos;s Smart Picks</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      {errorKind === 'noTopsOrBottoms' ? (
        <ErrorCard
          icon="👕"
          title="Add at least one top and one bottom to generate outfits"
          description="Add core pieces in Closet first."
          actionText="Go to Closet"
          onAction={() => tabNavigation.navigate('Closet')}
        />
      ) : null}

      {errorKind === 'noMatches' ? (
        <ErrorCard
          icon="🧭"
          title="No occasion outfits found"
          description="Showing closest alternatives."
          actionText="OK"
          onAction={() => {}}
        />
      ) : null}

      {errorKind === 'allBlocked' ? (
        <ErrorCard
          icon="🧠"
          title="We are still learning your taste"
          description="Add more feedback to improve suggestions."
          actionText="OK"
          onAction={() => {}}
        />
      ) : null}

      {morningOutfitId ? (
        <View style={styles.morningCard}>
          <Text style={styles.morningTitle}>How did this outfit feel yesterday?</Text>
          <View style={styles.morningRow}>
            <Pressable style={styles.morningBtn} onPress={() => onMorningRate('loved')}><Text>😍 Loved it</Text></Pressable>
            <Pressable style={styles.morningBtn} onPress={() => onMorningRate('fine')}><Text>👍 It was fine</Text></Pressable>
            <Pressable style={styles.morningBtn} onPress={() => onMorningRate('notGreat')}><Text>😐 Not great</Text></Pressable>
          </View>
          <Pressable onPress={onMorningDismiss}>
            <Text style={styles.dismiss}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}

      {visibleOutfits.map((outfit) => {
        const anim = rejectAnimations.current[outfit.id] ?? new Animated.Value(0);
        rejectAnimations.current[outfit.id] = anim;

        return (
          <Animated.View
            key={outfit.id}
            style={{
              transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }],
              opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            }}
          >
            <OutfitCard
              outfit={outfit}
              onWhy={() => navigation.navigate('WhyThisOutfit', { outfitId: outfit.id })}
              onWear={() => { safeAsync(async () => recordWorn(outfit.id), 'HomeScreen.recordWorn'); }}
              onLike={() => { safeAsync(async () => recordLiked(outfit.id), 'HomeScreen.recordLiked'); }}
              onSkip={() => { safeAsync(async () => recordSkipped(outfit.id), 'HomeScreen.recordSkipped'); }}
              onReject={() => handleReject(outfit.id)}
            />
          </Animated.View>
        );
      })}

      {!loading && outfits.length > 0 && visibleOutfits.length === 0 ? (
        <View style={styles.box}><Text>All outfits skipped. Generating new ones...</Text></View>
      ) : null}

      {!loading && !visibleOutfits.length && !outfits.length ? (
        <View style={styles.box}><Text>Generate outfits from Occasion Planner to start.</Text></View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 14, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: '900', color: '#0f172a', marginBottom: 8 },
  note: { color: '#92400e', marginBottom: 8 },
  box: { marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  morningCard: { marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
  morningTitle: { fontWeight: '800', color: '#7c2d12' },
  morningRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  morningBtn: { backgroundColor: '#ffedd5', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  dismiss: { marginTop: 8, color: '#9a3412' },
});
