import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

function score(value: number): string {
  return `${Math.round(value)}`;
}

export default function HomeScreen(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 380;
  const collageHeight = compact ? 300 : 400;

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
  const [activeOutfitId, setActiveOutfitId] = useState<string | null>(null);
  const [wearPressed, setWearPressed] = useState(false);
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
    setActiveOutfitId(outfits[0]?.id ?? null);
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
        if (!updated.find((outfit) => outfit.id === activeOutfitId)) {
          setActiveOutfitId(updated[0]?.id ?? null);
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

  const activeOutfit = visibleOutfits.find((outfit) => outfit.id === activeOutfitId) ?? visibleOutfits[0] ?? null;

  const onWearActive = (): void => {
    if (!activeOutfit) return;
    safeAsync(async () => recordWorn(activeOutfit.id), 'HomeScreen.recordWorn');
  };

  const itemImageMap = useMemo(() => {
    const map: Record<string, string> = {};
    closetItems.forEach((item) => {
      map[item.id] = item.imagePath;
    });
    return map;
  }, [closetItems]);

  const hasNoClosetBasics = errorKind === 'noTopsOrBottoms';
  const showGenericEmptyState = !loading && !visibleOutfits.length && !outfits.length && !hasNoClosetBasics;
  const showWearBar = Boolean(activeOutfit) && !loading;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Math.max(8, insets.top + 2),
            paddingHorizontal: compact ? 12 : 14,
            paddingBottom: showWearBar ? Math.max(180, insets.bottom + 120) : Math.max(30, insets.bottom + 12),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { fontSize: compact ? 21 : 24 }]}>Today&apos;s Smart Picks</Text>
        {note && !hasNoClosetBasics ? <Text style={styles.note}>{note}</Text> : null}

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
            onAction={() => { }}
          />
        ) : null}

        {errorKind === 'allBlocked' ? (
          <ErrorCard
            icon="🧠"
            title="We are still learning your taste"
            description="Add more feedback to improve suggestions."
            actionText="OK"
            onAction={() => { }}
          />
        ) : null}

        {morningOutfitId ? (
          <View style={styles.morningCard}>
            <Text style={styles.morningTitle}>How did this outfit feel yesterday?</Text>
            <View style={styles.morningRow}>
              <Pressable style={styles.morningBtn} onPress={() => onMorningRate('loved')} accessibilityRole="button" accessibilityLabel="Loved it, morning check-in"><Text>😍 Loved it</Text></Pressable>
              <Pressable style={styles.morningBtn} onPress={() => onMorningRate('fine')} accessibilityRole="button" accessibilityLabel="It was fine, morning check-in"><Text>👍 It was fine</Text></Pressable>
              <Pressable style={styles.morningBtn} onPress={() => onMorningRate('notGreat')} accessibilityRole="button" accessibilityLabel="Not great, morning check-in"><Text>😐 Not great</Text></Pressable>
            </View>
            <Pressable onPress={onMorningDismiss} accessibilityRole="button" accessibilityLabel="Dismiss morning check-in">
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
          const isActive = activeOutfit?.id === outfit.id;
          const collageUris = outfit.itemIds.slice(0, 4).map((itemId) => itemImageMap[itemId] ?? null);

          return (
            <Animated.View
              key={outfit.id}
              style={{
                transform: [
                  { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) },
                  { scale: isActive ? 1 : 0.95 },
                ],
                opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [isActive ? 1 : 0.8, 0] }),
              }}
            >
              <Pressable onPress={() => setActiveOutfitId(outfit.id)} style={styles.outfitCard}>
                <Text style={[styles.outfitName, { fontSize: compact ? 24 : 30, paddingHorizontal: compact ? 16 : 24 }, !isActive ? styles.outfitNameSecondary : null]}>{outfit.name}</Text>

                <View style={[styles.collageGrid, { height: collageHeight }]}>
                  {Array.from({ length: 4 }).map((_, i) => {
                    const uri = collageUris[i];
                    return uri ? (
                      <Image key={`${outfit.id}-${i}`} source={{ uri }} resizeMode="cover" style={styles.collageCell} />
                    ) : (
                      <View key={`${outfit.id}-${i}`} style={[styles.collageCell, styles.collageFallback]} />
                    );
                  })}
                  {!isActive ? <View style={styles.collageGrayOverlay} /> : null}
                </View>

                <View style={[styles.cardBottom, { paddingHorizontal: compact ? 16 : 24 }]}>
                  <View style={styles.scoreRow}>
                    <View
                      style={[
                        styles.scorePill,
                        isActive ? styles.scoreColorPrimary : styles.scoreColorSecondary,
                      ]}
                    >
                      <Text style={[styles.scoreText, isActive ? styles.scoreTextPrimaryDark : styles.scoreTextColorSecondary]}>{isActive ? `COLOR ${score(outfit.colorScore)}` : `🎨 COLOR ${score(outfit.colorScore)}`}</Text>
                    </View>
                    <View
                      style={[
                        styles.scorePill,
                        isActive ? styles.scoreSkinPrimary : styles.scoreSkinSecondary,
                      ]}
                    >
                      <Text style={[styles.scoreText, isActive ? styles.scoreTextSkinPrimary : styles.scoreTextSkinSecondary]}>{isActive ? `SKIN ${score(outfit.skinScore)}` : `🌿 SKIN ${score(outfit.skinScore)}`}</Text>
                    </View>
                    <View
                      style={[
                        styles.scorePill,
                        isActive ? styles.scoreAiPrimary : styles.scoreAiSecondary,
                      ]}
                    >
                      <Text style={[styles.scoreText, isActive ? styles.scoreTextAiPrimary : styles.scoreTextAiSecondary]}>{isActive ? `AI ${score(outfit.geminiScore)}` : `✨ AI ${score(outfit.geminiScore)}`}</Text>
                    </View>
                  </View>

                  <View style={styles.feedbackRow}>
                    <View style={styles.feedbackButtonsWrap}>
                      <FeedbackButton
                        icon="favorite"
                        label="Like"
                        active={isActive}
                        onPress={() => { safeAsync(async () => recordLiked(outfit.id), 'HomeScreen.recordLiked'); }}
                      />
                      <FeedbackButton
                        icon="skip-next"
                        label="Skip"
                        active={isActive}
                        onPress={() => { safeAsync(async () => recordSkipped(outfit.id), 'HomeScreen.recordSkipped'); }}
                      />
                      <FeedbackButton
                        icon="thumb-down"
                        label="Not For Me"
                        active={isActive}
                        onPress={() => handleReject(outfit.id)}
                      />
                    </View>

                    <WhyLink
                      active={isActive}
                      onPress={() => navigation.navigate('WhyThisOutfit', { outfitId: outfit.id })}
                    />
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}

        {!loading && outfits.length > 0 && visibleOutfits.length === 0 ? (
          <View style={styles.box}><Text>All outfits skipped. Generating new ones...</Text></View>
        ) : null}

        {showGenericEmptyState ? (
          <View style={styles.box}>
            <Text style={styles.boxText}>Generate outfits from Occasion Planner to start.</Text>
          </View>
        ) : null}
      </ScrollView>

      {showWearBar ? (
        <View style={[styles.wearBarWrap, { bottom: Math.max(90, insets.bottom + 76), paddingHorizontal: compact ? 16 : 24 }]}>
          <Pressable
            onPress={onWearActive}
            disabled={!activeOutfit}
            onPressIn={() => setWearPressed(true)}
            onPressOut={() => setWearPressed(false)}
          >
            <Animated.View style={{ transform: [{ scale: wearPressed ? 0.95 : 1 }], opacity: 1 }}>
              <LinearGradient
                colors={['#e6c487', '#c9a96e']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.wearGradientFallback}
              >
                <Text style={styles.wearBtnText}>Wear This Today</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function FeedbackButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: 'favorite' | 'skip-next' | 'thumb-down';
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.feedbackBtn,
        active ? styles.feedbackBtnActive : styles.feedbackBtnMuted,
        hovered && active ? styles.feedbackBtnActiveHover : null,
        hovered && !active ? styles.feedbackBtnMutedHover : null,
      ]}
    >
      <MaterialIcons name={icon} size={16} color={active ? '#e6c487' : hovered ? '#e5e2e1' : 'rgba(208,197,181,0.70)'} />
      <Text style={[styles.feedbackBtnLabel, active ? styles.feedbackBtnTextActive : hovered ? styles.feedbackBtnTextMutedHover : styles.feedbackBtnTextMuted]}>{label}</Text>
    </Pressable>
  );
}

function WhyLink({ active, onPress }: { active: boolean; onPress: () => void }): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const color = active ? '#e6c487' : hovered ? '#e5e2e1' : 'rgba(208,197,181,0.70)';
  return (
    <Pressable onPress={onPress} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}>
      <View style={styles.whyWrap}>
        <Text style={[styles.whyText, { color, textDecorationLine: hovered ? 'underline' : 'none' }]}>Why This?</Text>
        <MaterialIcons name="arrow-forward" size={14} color={color} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#131313' },
  container: { paddingHorizontal: 14, paddingBottom: 180, backgroundColor: '#131313' },
  title: { fontSize: 24, fontWeight: '900', color: '#e5e2e1', marginBottom: 8 },
  note: { color: '#d7c5a0', marginBottom: 8 },
  box: { marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: '#1f1f1f', borderWidth: 1, borderColor: '#2a2a2a' },
  boxText: { color: '#d0c5b5', fontFamily: 'Inter_500Medium', fontSize: 14 },
  morningCard: { marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
  morningTitle: { fontWeight: '800', color: '#7c2d12' },
  morningRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  morningBtn: { backgroundColor: '#ffedd5', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  dismiss: { marginTop: 8, color: '#9a3412' },
  outfitCard: {
    marginBottom: 26,
    backgroundColor: '#1b1b1b',
    borderRadius: 16,
    overflow: 'hidden',
  },
  outfitName: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 30,
    letterSpacing: -0.4,
  },
  outfitNameSecondary: {
    fontStyle: 'italic',
    opacity: 0.5,
  },
  collageGrid: {
    height: 400,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    backgroundColor: '#353534',
  },
  collageCell: {
    width: '49.6%',
    height: '49.6%',
    backgroundColor: '#353534',
  },
  collageFallback: {
    backgroundColor: '#353534',
  },
  collageGrayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(90,90,90,0.2)',
  },
  cardBottom: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 24,
  },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  scorePill: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  scoreColorPrimary: { backgroundColor: '#e6c487', borderColor: 'rgba(230,196,135,0.20)' },
  scoreSkinPrimary: { backgroundColor: '#d7c5a0', borderColor: 'rgba(215,197,160,0.20)' },
  scoreAiPrimary: { backgroundColor: '#9dadd5', borderColor: 'rgba(184,200,242,0.20)' },
  scoreColorSecondary: { backgroundColor: '#e6c487', borderColor: 'rgba(230,196,135,0.20)' },
  scoreSkinSecondary: { backgroundColor: '#4db6ac', borderColor: 'rgba(77,182,172,0.20)' },
  scoreAiSecondary: { backgroundColor: '#b39ddb', borderColor: 'rgba(179,157,219,0.20)' },
  scoreText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  scoreTextPrimaryDark: { color: '#261900' },
  scoreTextColorSecondary: { color: '#5a4a22' },
  scoreTextSkinPrimary: { color: '#241a04' },
  scoreTextAiPrimary: { color: '#314163' },
  scoreTextSkinSecondary: { color: '#00201d' },
  scoreTextAiSecondary: { color: '#1a0033' },
  feedbackRow: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    paddingTop: 16,
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  feedbackButtonsWrap: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  feedbackBtn: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    alignItems: 'center',
  },
  feedbackBtnActive: {
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
  },
  feedbackBtnMuted: {
    backgroundColor: '#2a2a2a',
  },
  feedbackBtnMutedHover: {
    backgroundColor: '#2a2a2a',
  },
  feedbackBtnActiveHover: {
    backgroundColor: 'rgba(230,196,135,0.10)',
  },
  feedbackBtnLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  feedbackBtnTextActive: { color: '#e6c487' },
  feedbackBtnTextMuted: { color: 'rgba(208,197,181,0.70)' },
  feedbackBtnTextMutedHover: { color: '#e5e2e1' },
  whyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  whyText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  wearBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    paddingHorizontal: 24,
  },
  wearGradientFallback: {
    height: 56,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d9b97f',
    shadowColor: '#e6c487',
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  wearBtnText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    fontSize: 14,
  },
});
