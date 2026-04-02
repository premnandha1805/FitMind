import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOutfitStore } from '../store/useOutfitStore';
import { useClosetStore } from '../store/useClosetStore';
import { useResponsive } from '../utils/responsive';

const FILTERS = ['All', 'Loved', 'Worn', 'Recent'] as const;
type FilterType = (typeof FILTERS)[number];

const DEFAULT_OCCASION = 'Modern Minimalist';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }).toUpperCase();
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export default function HistoryScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { rs } = useResponsive();
  const outfits = useOutfitStore((s) => s.outfits);
  const closetItems = useClosetStore((s) => s.items);

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');

  const stats = useMemo(() => {
    const looksWorn = outfits.filter((outfit) => outfit.wornOn).length;
    const likedFits = outfits.filter((outfit) => outfit.liked > 0).length;

    const occasionCount = outfits.reduce<Record<string, number>>((acc, outfit) => {
      const key = outfit.occasion || DEFAULT_OCCASION;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const topCategory = Object.entries(occasionCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_OCCASION;

    return {
      looksWorn,
      likedFits,
      topCategory: titleCase(topCategory),
    };
  }, [outfits]);

  const visibleOutfits = useMemo(() => {
    let filtered = [...outfits];

    if (activeFilter === 'Loved') filtered = filtered.filter((outfit) => outfit.liked > 0);
    if (activeFilter === 'Worn') filtered = filtered.filter((outfit) => Boolean(outfit.wornOn));
    if (activeFilter === 'Recent') {
      filtered = filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      filtered = filtered.filter((outfit) => {
        const rawOcc = outfit.occasion || DEFAULT_OCCASION;
        const occasion = rawOcc.toLowerCase();
        const title = titleCase(rawOcc).toLowerCase();
        return occasion.includes(query) || title.includes(query);
      });
    }

    return filtered;
  }, [activeFilter, outfits, search]);

  const headerHeight = Math.max(64, insets.top + rs(54, 50, 64));

  return (
    <View style={styles.screen}>
      <BlurView
        intensity={20}
        tint="dark"
        style={[
          styles.header,
          {
            height: headerHeight,
            paddingTop: insets.top,
            paddingHorizontal: rs(24, 14, 28),
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerIconCircle}>
            <MaterialIcons name="history" size={22} color="#e6c487" />
          </View>
          <Text style={styles.headerTitle}>Style History</Text>
        </View>
      </BlurView>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: headerHeight + rs(20, 16, 28),
            paddingHorizontal: rs(24, 14, 28),
            paddingBottom: Math.max(120, insets.bottom + rs(90, 78, 124)),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.summaryRow}
        >
          <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
            <Text style={styles.summaryLabel}>Looks Worn</Text>
            <Text style={styles.summaryValue}>{stats.looksWorn}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Liked Fits</Text>
            <Text style={styles.summaryValue}>{stats.likedFits}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Top Category</Text>
            <Text style={styles.summaryValueSmall}>{stats.topCategory}</Text>
          </View>
        </ScrollView>

        <View style={styles.searchWrap}>
          <View style={styles.searchPill}>
            <MaterialIcons name="search" size={18} color="#998f81" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search looks..."
              placeholderTextColor="#998f81"
              style={styles.searchInput}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((filter) => {
              const selected = activeFilter === filter;
              return (
                <Pressable key={filter} onPress={() => setActiveFilter(filter)}>
                  {selected ? (
                    <LinearGradient
                      colors={['#e6c487', '#c9a96e']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.filterChipActive}
                    >
                      <Text style={styles.filterChipActiveText}>{filter}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.filterChip}>
                      <Text style={styles.filterChipText}>{filter}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { fontSize: rs(28, 22, 30) }]}>Recent Activity</Text>
          <View style={styles.sectionLine} />
        </View>

        {visibleOutfits.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="history" size={28} color="#e6c487" />
            <Text style={styles.emptyTitle}>No outfit history yet.</Text>
            <Text style={styles.emptySubtitle}>Generate and wear outfits to build your timeline.</Text>
          </View>
        ) : (
          visibleOutfits.map((outfit, index) => {
            const previewIds = outfit.itemIds.slice(0, 4);
            const images = previewIds.map((id) => {
              const uri = closetItems.find((item) => item.id === id)?.imagePath;
              return uri ? { id, uri } : null;
            }).filter(Boolean) as { id: string, uri: string }[];
            const remaining = Math.max(0, outfit.itemIds.length - previewIds.length);
            const displayOccasion = outfit.occasion || DEFAULT_OCCASION;
            const displayScore = outfit.finalScore ?? 0;

            return (
              <View key={outfit.id} style={[styles.activityCard, index === visibleOutfits.length - 1 ? styles.lastActivityCard : null]}>
                <View style={styles.activityHeader}>
                  <View>
                    <Text style={styles.activityDate}>{formatDate(outfit.createdAt)}</Text>
                    <Text style={styles.activityTitle}>{titleCase(displayOccasion)}</Text>
                  </View>

                  <View style={styles.activityRight}>
                    <View style={styles.tag}><Text style={styles.tagText}>{titleCase(displayOccasion)}</Text></View>
                    <View style={styles.scoreTag}><Text style={styles.scoreText}>{displayScore.toFixed(1)}/10</Text></View>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.thumbRow}
                >
                  {images.map((image) => (
                    <View key={image.id} style={styles.thumbWrap}>
                      <Image source={{ uri: image.uri }} style={styles.thumbImage} resizeMode="cover" />
                    </View>
                  ))}
                  {remaining > 0 ? (
                    <View style={[styles.thumbWrap, styles.moreWrap]}>
                      <Text style={styles.moreText}>+{remaining}</Text>
                    </View>
                  ) : null}
                </ScrollView>

              </View>
            );
          })
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#131313',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,10,0.60)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#353534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#c9a96e',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 22,
  },
  container: {
    paddingTop: 84,
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  summaryRow: {
    gap: 12,
    marginHorizontal: -24,
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  summaryCard: {
    minWidth: 128,
    flex: 1,
    backgroundColor: '#1c1b1b',
    borderRadius: 16,
    padding: 18,
  },
  summaryCardPrimary: {
    borderLeftWidth: 4,
    borderLeftColor: '#e6c487',
  },
  summaryLabel: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  summaryValue: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 30,
    lineHeight: 34,
  },
  summaryValueSmall: {
    color: '#e6c487',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 22,
    lineHeight: 28,
  },
  searchWrap: {
    gap: 12,
    marginBottom: 24,
  },
  searchPill: {
    backgroundColor: '#1c1b1b',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#e5e2e1',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    paddingVertical: 0,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(153,143,129,0.10)',
    backgroundColor: '#2a2a2a',
  },
  filterChipText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  filterChipActive: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  filterChipActiveText: {
    color: '#261900',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 28,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(77,70,58,0.30)',
  },
  activityCard: {
    backgroundColor: '#1c1b1b',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  lastActivityCard: {
    opacity: 0.8,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
  },
  activityDate: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  activityTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 20,
    marginTop: 2,
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: 'rgba(153,143,129,0.15)',
  },
  tagText: {
    color: '#e6c487',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  scoreTag: {
    backgroundColor: 'rgba(230,196,135,0.10)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  scoreText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  thumbRow: {
    gap: 10,
    marginBottom: 14,
  },
  thumbWrap: {
    width: 64,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#353534',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  moreWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    backgroundColor: '#1c1b1b',
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 16,
  },
  emptySubtitle: {
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  bottomSpacer: { height: 24 },
});
