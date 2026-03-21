import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, Pressable, Text, StyleSheet, Image, Animated, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useClosetStore } from '../store/useClosetStore';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ClothingItem as ClothingItemModel } from '../types/models';
import { ensureImageUnder4Mb, saveImageToAppDir } from '../utils/imageUtils';
import { safeAsync } from '../utils/safeAsync';

function ClosetSkeletonGrid(): React.JSX.Element {
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
    outputRange: [-80, 80],
  });

  return (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={`sk-${index}`} style={styles.skeletonCard}>
          <Animated.View style={[styles.skeletonShimmer, { transform: [{ translateX }] }]} />
        </View>
      ))}
    </View>
  );
}

export default function ClosetScreen(): React.JSX.Element {
  const items = useClosetStore((s) => s.items);
  const filter = useClosetStore((s) => s.filter);
  const setFilter = useClosetStore((s) => s.setFilter);
  const loadItems = useClosetStore((s) => s.loadItems);
  const loading = useClosetStore((s) => s.loading);
  const updateItemImage = useClosetStore((s) => s.updateItemImage);
  const deleteItem = useClosetStore((s) => s.deleteItem);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<ClothingItemModel | null>(null);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const filtered = filter === 'all' ? items : items.filter((i) => i.category === filter);

  const filters = useMemo(() => ['all', 'top', 'bottom', 'shoes', 'accessory'], []);

  const retakePhoto = async (item: ClothingItemModel): Promise<void> => {
    const { data: uri } = await safeAsync(async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return null;
      const result = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.back, quality: 1 });
      if (result.canceled) return null;
      const compressed = await ensureImageUnder4Mb(result.assets[0].uri);
      const saved = await saveImageToAppDir(compressed, 'closet');
      return saved;
    }, 'ClosetScreen.retakePhoto');

    if (!uri) return;

    await updateItemImage(item.id, uri);
    setBrokenImages((prev) => ({ ...prev, [item.id]: false }));
  };

  const renderItem = ({ item }: { item: ClothingItemModel }): React.JSX.Element => {
    const isBroken = brokenImages[item.id];
    return (
      <Pressable
        style={styles.itemCard}
        onLongPress={() => setDeleteTarget(item)}
      >
        {isBroken ? (
          <Pressable style={styles.placeholder} onPress={() => { void retakePhoto(item); }}>
            <Ionicons name="camera" size={18} color="#64748b" />
            <Text style={styles.placeholderText}>Tap to retake</Text>
          </Pressable>
        ) : (
          <Image
            source={{ uri: item.imagePath }}
            style={styles.image}
            onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
          />
        )}
        <View style={styles.itemMeta}>
          <Text style={styles.itemCategory}>{item.category}</Text>
          <Text style={styles.itemStyle}>{item.styleType}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        {filters.map((value) => (
          <Pressable key={value} style={[styles.filter, filter === value && styles.filterOn]} onPress={() => setFilter(value as typeof filter)}>
            <Text style={styles.filterText}>{value}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ClosetSkeletonGrid />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ListEmptyComponent={(
            <View style={styles.emptyWrap}>
              <Ionicons name="shirt-outline" size={44} color="#64748b" />
              <Text style={styles.emptyTitle}>Your closet is empty</Text>
              <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('AddItem')}>
                <Text style={styles.emptyBtnText}>Add Item</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal transparent visible={Boolean(deleteTarget)} animationType="slide" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setDeleteTarget(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Delete this item?</Text>
            <Text style={styles.sheetSub}>This will remove it from your closet.</Text>
            <View style={styles.sheetActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.deleteBtn}
                onPress={() => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  if (!target) return;
                  void deleteItem(target.id, target.imagePath);
                }}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddItem')}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, marginBottom: 8 },
  filter: { backgroundColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  filterOn: { backgroundColor: '#99f6e4' },
  filterText: { textTransform: 'capitalize', fontWeight: '600' },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, justifyContent: 'space-between' },
  skeletonCard: { width: '31%', aspectRatio: 0.78, borderRadius: 10, backgroundColor: '#e2e8f0', marginBottom: 10, overflow: 'hidden' },
  skeletonShimmer: { width: 56, height: '100%', backgroundColor: 'rgba(255,255,255,0.38)' },
  listContent: { paddingHorizontal: 10, paddingBottom: 90 },
  row: { justifyContent: 'space-between' },
  itemCard: { width: '31%', marginBottom: 10, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  image: { width: '100%', aspectRatio: 0.85, backgroundColor: '#e2e8f0' },
  placeholder: { width: '100%', aspectRatio: 0.85, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { marginTop: 4, color: '#64748b', fontSize: 11, fontWeight: '700' },
  itemMeta: { padding: 6 },
  itemCategory: { fontSize: 11, fontWeight: '800', color: '#334155', textTransform: 'capitalize' },
  itemStyle: { marginTop: 2, fontSize: 11, color: '#64748b', textTransform: 'capitalize' },
  emptyWrap: { marginTop: 80, alignItems: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 17, fontWeight: '800', color: '#0f172a' },
  emptyBtn: { marginTop: 12, backgroundColor: '#0f766e', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  emptyBtnText: { color: '#ffffff', fontWeight: '800' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  sheetSub: { marginTop: 4, color: '#475569' },
  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: '#334155', fontWeight: '700' },
  deleteBtn: { flex: 1, backgroundColor: '#dc2626', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  deleteText: { color: '#ffffff', fontWeight: '700' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#0f766e', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  fabText: { color: 'white', fontSize: 28, marginTop: -2 },
});
