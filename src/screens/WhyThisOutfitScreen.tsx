import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useOutfitStore } from '../store/useOutfitStore';
import { useTasteStore } from '../store/useTasteStore';
import { useClosetStore } from '../store/useClosetStore';
import { useUserStore } from '../store/useUserStore';

type Props = StackScreenProps<RootStackParamList, 'WhyThisOutfit'>;

const SCORE_ROWS = [
  { label: 'Color Harmony', value: 94 },
  { label: 'Undertone Sync', value: 88 },
  { label: 'Context Fit', value: 91 },
  { label: 'Personal Taste', value: 82 },
] as const;

const REASON_META = [
  {
    icon: 'palette',
    title: 'Color Composition',
    fallback: 'Tones were selected to stay balanced while keeping contrast intentional.',
  },
  {
    icon: 'air',
    title: 'Silhouette Flow',
    fallback: 'The layering rhythm keeps movement light and proportionally clean.',
  },
  {
    icon: 'event-seat',
    title: 'Occasion Framing',
    fallback: 'Pieces were ranked to match the setting while preserving your style signal.',
  },
] as const;

export default function WhyThisOutfitScreen({ route, navigation }: Props): React.JSX.Element {
  const outfit = useOutfitStore((s) => s.outfits.find((x) => x.id === route.params.outfitId));
  const profile = useTasteStore((s) => s.profile);
  const closetItems = useClosetStore((s) => s.items);
  const userProfile = useUserStore((s) => s.profile);
  const { width } = useWindowDimensions();
  const barAnims = useRef(SCORE_ROWS.map(() => new Animated.Value(0))).current;
  const tasteAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      ...barAnims.map((value) => Animated.timing(value, {
        toValue: 1,
        duration: 600,
        useNativeDriver: false,
      })),
      Animated.timing(tasteAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: false,
      }),
    ]).start();
  }, [barAnims, tasteAnim]);

  if (!outfit) {
    return <View style={styles.notFound}><Text style={styles.notFoundText}>Outfit not found.</Text></View>;
  }

  const interactions = profile?.feedbackCount ?? 0;
  const heroUri = outfit.itemIds
    .map((id) => closetItems.find((item) => item.id === id)?.imagePath)
    .find((uri): uri is string => Boolean(uri));

  const reasonCards = useMemo(
    () => REASON_META.map((meta, index) => ({
      ...meta,
      description: outfit.reasons[index] ?? meta.fallback,
    })),
    [outfit.reasons]
  );

  const heroWidth = width - 48;

  return (
    <View style={styles.screen}>
      <BlurView intensity={22} tint="dark" style={styles.headerBar}>
        <Pressable style={styles.headerLeft} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color="#C9A96E" />
          <Text style={styles.headerTitle}>Why This Outfit</Text>
        </Pressable>
        <View style={styles.avatarWrap}>
          {userProfile?.skinImagePath ? (
            <Image source={{ uri: userProfile.skinImagePath }} style={styles.avatarImage} resizeMode="cover" />
          ) : (
            <MaterialIcons name="person" size={16} color="#d0c5b5" />
          )}
        </View>
      </BlurView>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { width: heroWidth }]}> 
          {heroUri ? (
            <Image source={{ uri: heroUri }} resizeMode="cover" style={styles.heroImage} />
          ) : (
            <View style={styles.heroFallback}>
              <MaterialIcons name="checkroom" size={46} color="#d0c5b5" />
            </View>
          )}
          <LinearGradient
            colors={['rgba(14,14,14,0.80)', 'rgba(14,14,14,0)']}
            start={{ x: 0.5, y: 1 }}
            end={{ x: 0.5, y: 0 }}
            style={styles.heroGradient}
          />

          <BlurView intensity={20} tint="dark" style={styles.heroOverlayCard}>
            <Text style={styles.outfitName}>{outfit.name}</Text>
            <Text style={styles.occasionText}>{outfit.occasion}</Text>
          </BlurView>
        </View>

        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Style Alignment</Text>
            <MaterialIcons name="auto-awesome" size={14} color="#e6c487" />
          </View>

          {SCORE_ROWS.map((row, index) => {
            const widthAnim = barAnims[index].interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', `${row.value}%`],
            });

            return (
              <View key={row.label} style={styles.scoreBlock}>
                <View style={styles.scoreMetaRow}>
                  <Text style={styles.scoreLabel}>{row.label}</Text>
                  <Text style={styles.scoreValue}>{row.value}%</Text>
                </View>
                <View style={styles.scoreTrack}>
                  <Animated.View style={[styles.scoreFillWrap, { width: widthAnim }]}>
                    <LinearGradient
                      colors={['#e6c487', '#c9a96e']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.scoreFill}
                    />
                  </Animated.View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Curation Logic</Text>
          <View style={styles.reasonList}>
            {reasonCards.map((reason) => (
              <View key={reason.title} style={styles.reasonCard}>
                <View style={styles.reasonIconWrap}>
                  <MaterialIcons name={reason.icon} size={20} color="#e6c487" />
                </View>
                <View style={styles.reasonBody}>
                  <Text style={styles.reasonTitle}>{reason.title}</Text>
                  <Text style={styles.reasonDescription}>{reason.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <LinearGradient
          colors={['#201f1f', '#1c1b1b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tasteCard}
        >
          <MaterialIcons name="model-training" size={96} color="rgba(229,226,225,0.10)" style={styles.tasteWatermark} />
          <View style={styles.tasteContent}>
            <View style={styles.tasteTopRow}>
              <View>
                <Text style={styles.tasteKicker}>TASTE EVOLUTION</Text>
                <Text style={styles.tasteLevel}>Artisan</Text>
              </View>

              <View style={styles.tasteSignalsWrap}>
                <Text style={styles.tasteSignalsLabel}>TOTAL SIGNALS</Text>
                <Text style={styles.tasteSignalsValue}>{interactions}</Text>
              </View>
            </View>

            <View style={styles.tasteBarWrap}>
              <View style={styles.tasteBarTrack}>
                <Animated.View
                  style={[
                    styles.tasteBarFill,
                    { width: tasteAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '65%'] }) },
                  ]}
                />
              </View>

              <View style={styles.tasteLabelsRow}>
                <Text style={styles.tasteLabelLeft}>Current: Artisan</Text>
                <Text style={styles.tasteLabelRight}>Next: Visionary (82 more edits)</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#131313',
  },
  notFound: {
    flex: 1,
    backgroundColor: '#131313',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_500Medium',
  },
  headerBar: {
    height: 64,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(10,10,10,0.60)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerTitle: {
    color: '#E5E2E1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 18,
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.30)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 28,
  },
  heroCard: {
    alignSelf: 'center',
    aspectRatio: 4 / 5,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#353534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlayCard: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
    backgroundColor: 'rgba(32,31,31,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
  },
  outfitName: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold_Italic',
    fontSize: 20,
    marginBottom: 4,
  },
  occasionText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  sectionWrap: {
    gap: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 24,
    letterSpacing: -0.4,
  },
  scoreBlock: {
    gap: 8,
  },
  scoreMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  scoreLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  scoreValue: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold_Italic',
    fontSize: 14,
  },
  scoreTrack: {
    width: '100%',
    height: 6,
    borderRadius: 9999,
    backgroundColor: '#201f1f',
    overflow: 'hidden',
  },
  scoreFillWrap: {
    height: '100%',
  },
  scoreFill: {
    width: '100%',
    height: '100%',
  },
  reasonList: {
    gap: 12,
  },
  reasonCard: {
    backgroundColor: '#1c1b1b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.10)',
    flexDirection: 'row',
    gap: 16,
  },
  reasonIconWrap: {
    marginTop: 4,
    flexShrink: 0,
  },
  reasonBody: {
    flex: 1,
  },
  reasonTitle: {
    color: '#e5e2e1',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    marginBottom: 4,
  },
  reasonDescription: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  tasteCard: {
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    borderRadius: 16,
    padding: 32,
    overflow: 'hidden',
    position: 'relative',
  },
  tasteWatermark: {
    position: 'absolute',
    top: 10,
    right: 12,
  },
  tasteContent: {
    zIndex: 1,
  },
  tasteTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  tasteKicker: {
    marginBottom: 8,
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
  },
  tasteLevel: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 24,
  },
  tasteSignalsWrap: {
    alignItems: 'flex-end',
  },
  tasteSignalsLabel: {
    marginBottom: 4,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  tasteSignalsValue: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold_Italic',
    fontSize: 18,
  },
  tasteBarWrap: {
    marginTop: 24,
  },
  tasteBarTrack: {
    height: 4,
    borderRadius: 9999,
    backgroundColor: '#353534',
    overflow: 'hidden',
  },
  tasteBarFill: {
    height: '100%',
    backgroundColor: '#e6c487',
    shadowColor: '#e4c285',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  tasteLabelsRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  tasteLabelLeft: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  tasteLabelRight: {
    color: '#e6c487',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
