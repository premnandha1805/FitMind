import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useClosetStore } from '../store/useClosetStore';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ClothingItem as ClothingItemModel } from '../types/models';
import { useUserStore } from '../store/useUserStore';

function monthToSeason(month: number): string {
  if (month >= 5 && month <= 7) return 'Summer Collection';
  if (month >= 8 && month <= 10) return 'Autumn Collection';
  if (month === 11 || month <= 1) return 'Winter Collection';
  return 'Spring Collection';
}

function categoryLabel(category: ClothingItemModel['category']): string {
  if (category === 'top') return 'TOPS';
  if (category === 'bottom') return 'BOTTOMS';
  if (category === 'outerwear') return 'OUTERWEAR';
  if (category === 'shoes') return 'SHOES';
  if (category === 'accessory') return 'ACCESSORIES';
  return 'OTHER';
}

function ClosetSkeletonGrid({ itemWidth, gap }: { itemWidth: number; gap: number }): React.JSX.Element {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-itemWidth, itemWidth],
  });

  return (
    <View style={[styles.grid, { gap }]}>
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={`sk-${index}`} style={[styles.skeletonCard, { width: itemWidth }]}>
          <Animated.View style={[styles.skeletonShimmerWrap, { transform: [{ translateX }] }]}>
            <LinearGradient
              colors={['#201f1f', '#2a2a2a', '#201f1f']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.skeletonShimmer}
            />
          </Animated.View>
        </View>
      ))}
    </View>
  );
}

function ClosetCard({
  item,
  width,
  missingImage,
  onImageError,
  onRetake,
  onLongPress,
}: {
  item: ClothingItemModel;
  width: number;
  missingImage: boolean;
  onImageError: (itemId: string) => void;
  onRetake: (item: ClothingItemModel) => void;
  onLongPress: (item: ClothingItemModel) => void;
}): React.JSX.Element {
  const lift = useRef(new Animated.Value(0)).current;
  const grayscaleOverlay = useRef(new Animated.Value(1)).current;

  const onHover = (hovered: boolean): void => {
    Animated.timing(lift, {
      toValue: hovered ? 1 : 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
    Animated.timing(grayscaleOverlay, {
      toValue: hovered ? 0 : 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  };

  const translateY = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  return (
    <Animated.View style={{ width, transform: [{ translateY }] }}>
      <Pressable
        style={styles.card}
        onLongPress={() => onLongPress(item)}
        onHoverIn={() => onHover(true)}
        onHoverOut={() => onHover(false)}
        delayLongPress={280}
      >
        {missingImage ? (
          <Pressable style={styles.missingWrap} onPress={() => onRetake(item)}>
            <MaterialIcons name="photo-camera" size={32} color="#d0c5b5" />
            <Text style={styles.missingText}>Tap to retake</Text>
          </Pressable>
        ) : (
          <>
            <Image
              source={{ uri: item.imagePath }}
              style={styles.cardImage}
              resizeMode="cover"
              onError={() => onImageError(item.id)}
            />
            <Animated.View
              style={[
                styles.imageGrayOverlay,
                {
                  opacity: grayscaleOverlay.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.2],
                  }),
                },
              ]}
            />
          </>
        )}

        <BlurView intensity={20} tint="dark" style={styles.badgeWrap}>
          <Text style={styles.badgeText}>{categoryLabel(item.category)}</Text>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

function ScrollFilter({
  filters,
  current,
  onChange,
}: {
  filters: ReadonlyArray<{ value: 'all' | 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory'; label: string }>;
  current: 'all' | 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory';
  onChange: (value: 'all' | 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory') => void;
}): React.JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
      {filters.map((filter) => {
        const selected = current === filter.value;
        return selected ? (
          <LinearGradient
            key={filter.value}
            colors={['#e6c487', '#c9a96e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.filterSelected}
          >
            <Text style={styles.filterSelectedText}>{filter.label}</Text>
          </LinearGradient>
        ) : (
          <Pressable
            key={filter.value}
            style={styles.filterUnselected}
            onPress={() => onChange(filter.value)}
            onHoverIn={() => setHovered(filter.value)}
            onHoverOut={() => setHovered(null)}
          >
            <Text style={[styles.filterUnselectedText, hovered === filter.value ? styles.filterUnselectedHoverText : null]}>{filter.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function ClosetScreen(): React.JSX.Element {
  const items = useClosetStore((s) => s.items);
  const filter = useClosetStore((s) => s.filter);
  const setFilter = useClosetStore((s) => s.setFilter);
  const loadItems = useClosetStore((s) => s.loadItems);
  const loading = useClosetStore((s) => s.loading);
  const deleteItem = useClosetStore((s) => s.deleteItem);
  const profile = useUserStore((s) => s.profile);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<ClothingItemModel | null>(null);
  const [menuHovered, setMenuHovered] = useState(false);
  const [fabPressed, setFabPressed] = useState(false);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);

  const filters = useMemo(
    () => [
      { value: 'all', label: 'All' },
      { value: 'top', label: 'Tops' },
      { value: 'bottom', label: 'Bottoms' },
      { value: 'outerwear', label: 'Outerwear' },
      { value: 'shoes', label: 'Shoes' },
      { value: 'accessory', label: 'Accessories' },
    ] as const,
    []
  );

  const gap = width >= 500 ? 20 : 16;
  const itemWidth = Math.floor((width - 48 - gap * 2) / 3);
  const seasonLabel = monthToSeason(new Date().getMonth());
  const headerSubtitle = `${items.length} Pieces • ${seasonLabel}`;

  return (
    <View style={styles.screen}>
      <BlurView intensity={26} tint="dark" style={styles.headerBar}>
        <Pressable
          onHoverIn={() => setMenuHovered(true)}
          onHoverOut={() => setMenuHovered(false)}
          style={styles.headerIconBtn}
        >
          <Ionicons name="menu" size={24} color={menuHovered ? '#e6c487' : '#C9A96E'} />
        </Pressable>
        <Text style={styles.headerTitle}>Digital Atelier</Text>
        <View style={styles.avatarWrap}>
          {profile?.skinImagePath ? (
            <Image source={{ uri: profile.skinImagePath }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <Ionicons name="person" size={15} color="#d0c5b5" />
          )}
        </View>
      </BlurView>

      {loading ? (
        <View style={styles.loadingWrap}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Curated Closet</Text>
            <Text style={styles.pageSubtitle}>{headerSubtitle}</Text>
          </View>
          <ClosetSkeletonGrid itemWidth={itemWidth} gap={gap} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <ClosetCard
              item={item}
              width={itemWidth}
              missingImage={Boolean(brokenImages[item.id])}
              onImageError={(itemId) => setBrokenImages((prev) => ({ ...prev, [itemId]: true }))}
              onRetake={(closetItem) => {
                navigation.navigate('AddItem', {
                  existingItemId: closetItem.id,
                  prefill: {
                    category: closetItem.category,
                    pattern: closetItem.pattern ?? 'solid',
                    styleType: closetItem.styleType,
                    colorHex: closetItem.colorHex,
                  },
                });
              }}
              onLongPress={(closetItem) => setDeleteTarget(closetItem)}
            />
          )}
          columnWrapperStyle={{ gap, marginBottom: gap }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>Curated Closet</Text>
                <Text style={styles.pageSubtitle}>{headerSubtitle}</Text>
              </View>

              <ScrollFilter filters={filters} current={filter} onChange={(value) => setFilter(value)} />
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <MaterialIcons name="checkroom" size={48} color="#e6c487" />
              </View>
              <Text style={styles.emptyTitle}>Your closet is empty</Text>
              <Text style={styles.emptyBody}>
                Start curating your digital wardrobe by scanning your favorite pieces.
              </Text>
              <Animated.View style={{ transform: [{ scale: fabPressed ? 0.95 : 1 }] }}>
                <Pressable
                  onPress={() => navigation.navigate('AddItem')}
                  onPressIn={() => setFabPressed(true)}
                  onPressOut={() => setFabPressed(false)}
                >
                  <LinearGradient
                    colors={['#e6c487', '#c9a96e']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.emptyBtn}
                  >
                    <Text style={styles.emptyBtnText}>Add Item</Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </View>
          }
        />
      )}

      <Modal transparent visible={Boolean(deleteTarget)} animationType="slide" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setDeleteTarget(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Remove this item from your closet?</Text>
            <Pressable
              onPress={() => {
                const target = deleteTarget;
                setDeleteTarget(null);
                if (!target) return;
                void deleteItem(target.id, target.imagePath);
              }}
            >
              <LinearGradient
                colors={['#e6c487', '#c9a96e']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.removeBtn}
              >
                <Text style={styles.removeText}>Remove</Text>
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.cancelBtn} onPress={() => setDeleteTarget(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Animated.View style={[styles.fabWrap, { transform: [{ scale: fabPressed ? 0.9 : 1 }] }]}>
        <Pressable
          onPress={() => navigation.navigate('AddItem')}
          onPressIn={() => setFabPressed(true)}
          onPressOut={() => setFabPressed(false)}
        >
          <LinearGradient
            colors={['#e6c487', '#c9a96e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <Text style={styles.fabText}>+</Text>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#131313',
  },
  headerBar: {
    height: 64,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(10,10,10,0.60)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconBtn: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#C9A96E',
    fontFamily: 'NotoSerif_700Bold_Italic',
    fontSize: 20,
    letterSpacing: -0.3,
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#353534',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  loadingWrap: {
    flex: 1,
    paddingHorizontal: 24,
  },
  pageHeader: {
    marginTop: 96,
    marginBottom: 40,
  },
  pageTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 36,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    marginTop: 8,
    color: '#d0c5b5',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    letterSpacing: 0.6,
  },
  filtersRow: {
    gap: 12,
    paddingBottom: 24,
  },
  filterSelected: {
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 24,
    shadowColor: '#e6c487',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  filterSelectedText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  filterUnselected: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.15)',
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  filterUnselectedText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  filterUnselectedHoverText: {
    color: '#e5e2e1',
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 180,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  skeletonCard: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: '#201f1f',
    overflow: 'hidden',
  },
  skeletonShimmerWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '70%',
  },
  skeletonShimmer: {
    flex: 1,
  },
  card: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#201f1f',
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  imageGrayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#7d7d7d',
  },
  badgeWrap: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    borderRadius: 9999,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.40)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  badgeText: {
    color: '#e6c487',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  missingWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1c1b1b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingText: {
    marginTop: 8,
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  emptyWrap: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  emptyTitle: {
    color: '#e5e2e1',
    fontFamily: 'NotoSerif_700Bold',
    fontSize: 24,
  },
  emptyBody: {
    maxWidth: 280,
    textAlign: 'center',
    color: '#d0c5b5',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyBtn: {
    borderRadius: 9999,
    paddingVertical: 16,
    paddingHorizontal: 40,
    shadowColor: '#e6c487',
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  emptyBtnText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  sheetTitle: {
    color: '#e5e2e1',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    marginBottom: 16,
  },
  removeBtn: {
    width: '100%',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  removeText: {
    color: '#261900',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    textTransform: 'uppercase',
  },
  cancelBtn: {
    width: '100%',
    marginTop: 12,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(77,70,58,0.50)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: '#d0c5b5',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textTransform: 'uppercase',
  },
  fabWrap: {
    position: 'absolute',
    right: 24,
    bottom: 112,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e6c487',
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  fabText: {
    color: '#261900',
    fontSize: 34,
    fontFamily: 'Inter_700Bold',
    marginTop: -2,
  },
});
