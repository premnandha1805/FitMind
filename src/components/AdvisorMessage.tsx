import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClothingItem } from '../types/models';
import { AdvisorResponse } from '../services/scenarioEngine';
import { OutfitSuggestionCard } from './OutfitSuggestionCard';
import { MissingItemCard } from './MissingItemCard';

interface Props {
  response: AdvisorResponse;
  closetItems: ClothingItem[];
  onTryDifferent: () => void;
  onPerfect: () => void;
  isRefreshing?: boolean;
}

export function AdvisorMessage({ response, closetItems, onTryDifferent, onPerfect, isRefreshing = false }: Props): React.JSX.Element {
  const outfitItems = response.outfit
    ? closetItems.filter((item) => response.outfit?.itemIds.includes(item.id))
    : [];
  const closestItems = response.closestOutfit
    ? closetItems.filter((item) => response.closestOutfit?.itemIds.includes(item.id))
    : [];

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Situation understood</Text>
      <View style={styles.badgesRow}>
        <View style={styles.badge}><Text style={styles.badgeText}>{response.eventType}</Text></View>
        <View style={styles.badge}><Text style={styles.badgeText}>Formality {response.formality}/10</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Outfit suggestion</Text>
      {response.outfit ? (
        <OutfitSuggestionCard
          outfit={response.outfit}
          items={outfitItems}
          videoCallMode={response.videoCallMode}
          overallScore={response.allScores?.overall ?? null}
        />
      ) : response.closestOutfit ? (
        <OutfitSuggestionCard
          outfit={response.closestOutfit}
          items={closestItems}
          videoCallMode={response.videoCallMode}
          overallScore={null}
        />
      ) : null}

      <Text style={styles.sectionTitle}>Why this works</Text>
      {response.explanation.map((line) => (
        <View key={line} style={styles.lineRow}>
          <Ionicons name="checkmark-circle" size={16} color="#0f766e" />
          <Text style={styles.lineText}>{line}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Confidence tip</Text>
      <View style={styles.tipBox}>
        <Ionicons name="bulb" size={16} color="#a16207" />
        <Text style={styles.tipText}>{response.confidenceTip}</Text>
      </View>

      {response.missingItems.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Missing items</Text>
          {response.missingItems.map((item) => <MissingItemCard key={item} item={item} />)}
        </>
      ) : null}

      {response.videoCallMode ? (
        <>
          <Text style={styles.sectionTitle}>Video call tips</Text>
          <View style={styles.videoTipsBox}>
            <View style={styles.lineRow}>
              <Ionicons name="videocam" size={16} color="#0f766e" />
              <Text style={styles.lineText}>Video call tip: camera sees only your upper body. Focus on top and accessories for maximum impact.</Text>
            </View>
            <View style={styles.lineRow}>
              <Ionicons name="color-palette" size={16} color="#0f766e" />
              <Text style={styles.lineText}>Avoid white (overexposes) and red (bleeds on camera). Navy, teal and earth tones work best on video.</Text>
            </View>
          </View>
        </>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.secondaryBtn} onPress={onTryDifferent} disabled={isRefreshing}>
          <Text style={styles.secondaryText}>{isRefreshing ? 'Loading...' : 'Try a Different Look'}</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} onPress={onPerfect}>
          <Text style={styles.primaryText}>This is Perfect</Text>
          <Ionicons name="checkmark" size={14} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#ffffff',
    marginBottom: 10,
  },
  sectionTitle: {
    marginTop: 6,
    marginBottom: 6,
    fontWeight: '800',
    color: '#0f172a',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  badge: {
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#3730a3',
    fontWeight: '700',
    fontSize: 12,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  lineText: {
    color: '#334155',
    flex: 1,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    backgroundColor: '#fffbeb',
    padding: 10,
  },
  tipText: {
    flex: 1,
    color: '#92400e',
    fontWeight: '600',
  },
  videoTipsBox: {
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 10,
    backgroundColor: '#f0fdfa',
    padding: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#334155',
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
