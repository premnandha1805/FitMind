import React, { useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { FitCheckResult } from '../types/models';

interface Props {
  report: FitCheckResult;
  onSwapReject: (itemType: string) => void;
  onSwapUse: (itemType: string) => void;
  onRate: (rating: 'loved' | 'fine' | 'notGreat') => void;
  swapImageUri: string | null;
  ratingCaptured: boolean;
}

type ScoreCardProps = {
  title: string;
  verdict: string;
  badgeBackground: string;
  badgeTextColor: string;
  score: number;
  reason: string;
  reasonItalic?: boolean;
};

function ScoreCard({ title, verdict, badgeBackground, badgeTextColor, score, reason, reasonItalic = false }: ScoreCardProps): React.JSX.Element {
  return (
    <View style={styles.scoreCard}>
      <View style={styles.scoreHeaderRow}>
        <Text style={styles.scoreLabel}>{title}</Text>
        <View style={[styles.verdictBadge, { backgroundColor: badgeBackground }]}>
          <Text style={[styles.verdictBadgeText, { color: badgeTextColor }]}>{verdict}</Text>
        </View>
      </View>

      <View style={styles.scoreValueRow}>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.scoreOutOf}>/10</Text>
      </View>

      <Text style={[styles.scoreReason, reasonItalic ? styles.scoreReasonItalic : null]}>{reason}</Text>
    </View>
  );
}

export function FitReport({ report, onSwapReject, onSwapUse, onRate, swapImageUri, ratingCaptured }: Props): React.JSX.Element {
  const firstSwap = report.swap_suggestions[0] ?? null;
  const [swapUsePressed, setSwapUsePressed] = useState(false);
  const [swapRejectPressed, setSwapRejectPressed] = useState(false);
  const [hoveredReaction, setHoveredReaction] = useState<string | null>(null);
  const [ratingHidden, setRatingHidden] = useState(false);
  const ratingOpacity = useRef(new Animated.Value(1)).current;

  const stylingInsights = useMemo(() => report.styling_tips.slice(0, 3), [report.styling_tips]);

  const triggerRating = (rating: 'loved' | 'fine' | 'notGreat'): void => {
    if (ratingCaptured || ratingHidden) return;
    onRate(rating);
    Animated.timing(ratingOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setRatingHidden(true));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.overallBlock}>
        <Text style={styles.overallLabel}>OVERALL STYLE SCORE</Text>
        <Text style={styles.overallValue}>8/10</Text>
      </View>

      <View style={styles.cardsStack}>
        <ScoreCard
          title="SKIN TONE MATCH"
          verdict="EXCELLENT"
          badgeBackground="rgba(52,211,153,0.10)"
          badgeTextColor="#34d399"
          score={9}
          reason="warm undertones complement skin"
        />

        <ScoreCard
          title="COLOR HARMONY"
          verdict="HIGH BALANCE"
          badgeBackground="rgba(230,196,135,0.10)"
          badgeTextColor="#e6c487"
          score={8.5}
          reason="monochromatic palette cohesive"
        />

        <ScoreCard
          title="PROPORTION"
          verdict="TRENDING"
          badgeBackground="#353534"
          badgeTextColor="#d0c5b5"
          score={7}
          reason={'The oversized blazer is trending, but consider\ncinching the waist to maintain your silhouette.'}
          reasonItalic
        />
      </View>

      <View style={styles.colorTipsCard}>
        <Text style={styles.colorTipsLabel}>COLOR TIPS</Text>
        {report.color_tips.map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <MaterialIcons name="check-circle" size={16} color="#543d0c" style={styles.tipIcon} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      <View style={styles.insightsWrap}>
        <Text style={styles.insightsLabel}>STYLING INSIGHTS</Text>
        <View style={styles.insightsStack}>
          {stylingInsights.map((tip, idx) => (
            <View key={`${tip}-${idx}`} style={styles.insightCard}>
              <View style={styles.insightBadge}><Text style={styles.insightBadgeText}>{idx + 1}</Text></View>
              <Text style={styles.insightText}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      {firstSwap ? (
        <View style={styles.swapCard}>
          <View style={styles.swapMedia}>
            {swapImageUri ? (
              <Image source={{ uri: swapImageUri }} style={styles.swapImage} resizeMode="cover" />
            ) : (
              <View style={[styles.swapImage, styles.swapFallback]}>
                <MaterialIcons name="checkroom" size={34} color="#d0c5b5" />
              </View>
            )}

            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.80)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.swapOverlay}
            />

            <View style={styles.swapMediaContent}>
              <Text style={styles.swapFromLabel}>FROM YOUR CLOSET</Text>
              <Text style={styles.swapItemName}>{firstSwap.item_type}</Text>
            </View>
          </View>

          <View style={styles.swapBody}>
            <Text style={styles.swapQuote}>{firstSwap.reason}</Text>

            <View style={styles.swapActions}>
              <Pressable
                onPress={() => onSwapUse(firstSwap.item_type)}
                onPressIn={() => setSwapUsePressed(true)}
                onPressOut={() => setSwapUsePressed(false)}
                style={[styles.swapActionSlot, { transform: [{ scale: swapUsePressed ? 0.95 : 1 }] }]}
              >
                <LinearGradient
                  colors={['#e6c487', '#c9a96e']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.swapUseBtn}
                >
                  <Text style={styles.swapUseText}>Use This Swap</Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={() => onSwapReject(firstSwap.item_type)}
                onPressIn={() => setSwapRejectPressed(true)}
                onPressOut={() => setSwapRejectPressed(false)}
                style={[styles.swapActionSlot, styles.swapRejectBtn, { transform: [{ scale: swapRejectPressed ? 0.95 : 1 }] }]}
              >
                <Text style={styles.swapRejectText}>Not for me</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {!ratingHidden && !ratingCaptured ? (
        <Animated.View style={[styles.ratingWrap, { opacity: ratingOpacity }]}>
          <Text style={styles.ratingLabel}>Did this match how you felt?</Text>
          <View style={styles.ratingRow}>
            {[
              { key: 'loved', emoji: '😍' },
              { key: 'fine', emoji: '👍' },
              { key: 'notGreat', emoji: '😐' },
            ].map((item) => (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.ratingBtn,
                  hoveredReaction === item.key ? styles.ratingBtnHover : null,
                  { transform: [{ scale: pressed ? 0.9 : 1 }] },
                ]}
                onHoverIn={() => setHoveredReaction(item.key)}
                onHoverOut={() => setHoveredReaction(null)}
                onPress={() => triggerRating(item.key as 'loved' | 'fine' | 'notGreat')}
              >
                <Text style={styles.ratingEmoji}>{item.emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    gap: 24,
  },
  overallBlock: {
    alignItems: 'center',
  },
  overallLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#d0c5b5',
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    marginBottom: 8,
    textAlign: 'center',
  },
  overallValue: {
    fontFamily: 'NotoSerif_700Bold_Italic',
    fontSize: 96,
    color: '#e6c487',
    letterSpacing: -2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 8 },
    textShadowRadius: 18,
    lineHeight: 102,
  },
  cardsStack: {
    gap: 24,
  },
  scoreCard: {
    backgroundColor: '#201f1f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 24,
    width: '100%',
  },
  scoreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scoreLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  verdictBadge: {
    borderRadius: 9999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  verdictBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  scoreValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 12,
  },
  scoreValue: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 40,
    lineHeight: 44,
  },
  scoreOutOf: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  scoreReason: {
    marginTop: 10,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  scoreReasonItalic: {
    fontStyle: 'italic',
  },
  colorTipsCard: {
    backgroundColor: 'rgba(201,169,110,0.80)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    padding: 24,
    gap: 10,
  },
  colorTipsLabel: {
    color: '#543d0c',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    opacity: 0.8,
    marginBottom: 2,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  tipIcon: {
    marginTop: 2,
  },
  tipText: {
    flex: 1,
    color: '#543d0c',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  insightsWrap: {
    gap: 12,
  },
  insightsLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    paddingHorizontal: 4,
  },
  insightsStack: {
    gap: 12,
  },
  insightCard: {
    backgroundColor: '#1c1b1b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  insightBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(230,196,135,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightBadgeText: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 16,
    lineHeight: 20,
  },
  insightText: {
    flex: 1,
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  swapCard: {
    backgroundColor: '#201f1f',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  swapMedia: {
    height: 256,
    position: 'relative',
  },
  swapImage: {
    width: '100%',
    height: '100%',
  },
  swapFallback: {
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  swapMediaContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 24,
  },
  swapFromLabel: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  swapItemName: {
    color: '#ffffff',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 18,
    textTransform: 'capitalize',
  },
  swapBody: {
    padding: 24,
    gap: 24,
  },
  swapQuote: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  swapActions: {
    flexDirection: 'row',
    gap: 12,
  },
  swapActionSlot: {
    flex: 1,
  },
  swapUseBtn: {
    height: 48,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapUseText: {
    color: '#261900',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  swapRejectBtn: {
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapRejectText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  ratingWrap: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 48,
    alignItems: 'center',
    gap: 24,
  },
  ratingLabel: {
    color: '#d0c5b5',
    fontFamily: 'NotoSerif_400Regular_Italic',
    fontSize: 14,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 24,
  },
  ratingBtn: {
    padding: 16,
    borderRadius: 9999,
    backgroundColor: '#2a2a2a',
  },
  ratingBtnHover: {
    backgroundColor: 'rgba(230,196,135,0.20)',
  },
  ratingEmoji: {
    fontSize: 30,
  },
});
