import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { ClothingItem } from '../types/models';
import { AdvisorResponse } from '../services/scenarioEngine';
import { MissingItemCard } from './MissingItemCard';

interface Props {
  response: AdvisorResponse;
  closetItems: ClothingItem[];
  onTryDifferent: () => void;
  onPerfect: () => void;
  isRefreshing?: boolean;
}

export function AdvisorMessage({ response, closetItems, onTryDifferent, onPerfect, isRefreshing = false }: Props): React.JSX.Element {
  const { width } = useWindowDimensions();
  const [tryHovered, setTryHovered] = useState(false);
  const [perfectPressed, setPerfectPressed] = useState(false);

  const selectedOutfit = response.outfit ?? response.closestOutfit;
  const outfitItems = selectedOutfit
    ? selectedOutfit.itemIds
      .map((id) => closetItems.find((item) => item.id === id))
      .filter((item): item is ClothingItem => Boolean(item))
    : [];

  const secondaryBadges = [
    `${response.formality}/10`,
    response.videoCallMode ? 'Video Call' : 'In Person',
  ];

  const advisorText = response.closestOutfit
    ? 'I could not find an exact match in your closet, so I curated the closest look that still keeps your vibe polished.'
    : 'I styled this look to align with your event context, your tone harmony, and the way you naturally prefer silhouettes.';

  const stackButtons = width < 380;

  return (
    <View style={styles.card}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.badgesRow}
      >
        <View style={styles.badgePrimary}><Text style={styles.badgePrimaryText}>{response.eventType}</Text></View>
        {secondaryBadges.map((badge, index) => (
          <View key={`badge-${index}-${badge}`} style={styles.badgeSecondary}><Text style={styles.badgeSecondaryText}>{badge}</Text></View>
        ))}
      </ScrollView>

      <Text style={styles.advisorText}>{advisorText}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.clothingStrip}
      >
        {outfitItems.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <Image source={{ uri: item.imagePath }} resizeMode="cover" style={styles.itemImage} />
            <View style={styles.itemLabelWrap}>
              <Text style={styles.itemLabel}>{item.category.toUpperCase()}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <Text style={styles.whyLabel}>WHY THIS WORKS</Text>
      <View style={styles.whyList}>
        {response.explanation.map((line, index) => (
          <View key={`explain-${index}-${line.slice(0, 24)}`} style={styles.lineRow}>
            <MaterialIcons name="check-circle" size={16} color="#e6c487" />
            <Text style={styles.lineText}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tipBox}>
        <View style={styles.tipHeader}>
          <MaterialIcons name="lightbulb" size={14} color="#e6c487" />
          <Text style={styles.tipHeaderText}>Confidence Tip</Text>
        </View>
        <Text style={styles.tipText}>{response.confidenceTip}</Text>
      </View>

      {response.missingItems.length > 0 ? (
        <>
          {response.missingItems.map((item, index) => <MissingItemCard key={`missing-${index}-${item}`} item={item} />)}
        </>
      ) : null}

      <View style={[styles.actions, stackButtons ? styles.actionsStack : null]}>
        <Pressable
          style={[styles.secondaryBtn, tryHovered ? styles.secondaryBtnHover : null]}
          onPress={onTryDifferent}
          disabled={isRefreshing}
          onHoverIn={() => setTryHovered(true)}
          onHoverOut={() => setTryHovered(false)}
        >
          <Text style={styles.secondaryText}>{isRefreshing ? 'Loading...' : 'Try Different Look'}</Text>
        </Pressable>

        <Pressable
          onPress={onPerfect}
          onPressIn={() => setPerfectPressed(true)}
          onPressOut={() => setPerfectPressed(false)}
          style={{ transform: [{ scale: perfectPressed ? 0.95 : 1 }], flex: 1 }}
        >
          <LinearGradient colors={['#e6c487', '#c9a96e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>This is Perfect</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#201f1f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    padding: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  badgePrimary: {
    backgroundColor: 'rgba(230,196,135,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(230,196,135,0.20)',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgePrimaryText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  badgeSecondary: {
    backgroundColor: '#353534',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeSecondaryText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  advisorText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  clothingStrip: {
    gap: 12,
    paddingVertical: 4,
    marginBottom: 20,
  },
  itemCard: {
    minWidth: 120,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: '#1c1b1b',
    overflow: 'hidden',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemLabelWrap: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.60)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  itemLabel: {
    color: '#ffffff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  whyLabel: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 12,
  },
  whyList: {
    gap: 10,
    marginBottom: 20,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  lineText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  tipBox: {
    backgroundColor: 'rgba(230,196,135,0.10)',
    borderLeftWidth: 4,
    borderLeftColor: '#e6c487',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  tipHeaderText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  tipText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionsStack: {
    flexDirection: 'column',
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4d463a',
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnHover: { backgroundColor: '#2a2a2a' },
  secondaryText: {
    color: '#e5e2e1',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e6c487',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  primaryText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
});
