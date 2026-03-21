import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClothingItem, Outfit } from '../types/models';

interface Props {
  outfit: Outfit;
  items: ClothingItem[];
  videoCallMode: boolean;
  overallScore: number | null;
}

export function OutfitSuggestionCard({ outfit, items, videoCallMode, overallScore }: Props): React.JSX.Element {
  const visibleItems = videoCallMode
    ? items.filter((item) => item.category === 'top' || item.category === 'accessory')
    : items;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{outfit.name}</Text>
        {videoCallMode ? (
          <View style={styles.cameraBadge}>
            <Ionicons name="videocam" size={14} color="#0f766e" />
            <Text style={styles.cameraBadgeText}>Video Call</Text>
          </View>
        ) : null}
      </View>

      {overallScore !== null ? (
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>Overall {Math.round(overallScore)}/10</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {visibleItems.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <Image source={{ uri: item.imagePath }} style={styles.photo} />
            <Text style={styles.itemLabel}>{item.category.toUpperCase()}</Text>
            <Text style={styles.itemMeta}>{item.styleType}</Text>
          </View>
        ))}
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
  },
  cameraBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfeff',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cameraBadgeText: {
    color: '#0f766e',
    fontWeight: '700',
    fontSize: 12,
  },
  scoreBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  scoreText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 8,
    backgroundColor: '#f8fafc',
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    marginBottom: 6,
  },
  itemLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  itemMeta: {
    fontSize: 12,
    color: '#475569',
  },
});
