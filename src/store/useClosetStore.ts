import { create } from 'zustand';
import { Platform } from 'react-native';
import { ClothingItem } from '../types/models';
import { executeSqlWithRetry, getAll } from '../db/queries';
import { safeAsync } from '../utils/safeAsync';
import * as FileSystem from 'expo-file-system/legacy';
import { normalizeClothingItem } from '../utils/normalizer';
import { resolveCategory } from '../constants/categoryMap';

interface ClosetState {
  items: ClothingItem[];
  loading: boolean;
  filter: 'all' | 'top' | 'bottom' | 'shoes' | 'accessory' | 'outerwear';
  loadItems: () => Promise<void>;
  addItem: (item: ClothingItem) => Promise<void>;
  deleteItem: (id: string, imagePath?: string) => Promise<void>;
  updateItemImage: (id: string, nextImagePath: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<Omit<ClothingItem, 'id' | 'createdAt'>>) => Promise<void>;
  setFilter: (filter: ClosetState['filter']) => void;
  migrateCategories: () => Promise<void>;
}

export const useClosetStore = create<ClosetState>((set, get) => ({
  items: [],
  loading: false,
  filter: 'all',

  loadItems: async () => {
    if (Platform.OS === 'web') {
      set({ items: [], loading: false });
      return;
    }

    set({ loading: true });
    await safeAsync(async () => {
      const rows = await getAll<{
        id: string;
        image_path: string;
        category: ClothingItem['category'];
        subcategory: string;
        color_hsl: string;
        color_hex: string;
        color_family: ClothingItem['colorFamily'];
        pattern: ClothingItem['pattern'];
        style_type: ClothingItem['styleType'];
        fit_type: ClothingItem['fitType'];
        season: ClothingItem['season'];
        user_corrected: number;
        ai_confidence: number;
        ai_raw_label: string;
        times_worn: number;
        last_worn: string | null;
        created_at: string;
      }>('SELECT * FROM clothing_items ORDER BY created_at DESC;');

      set({
        items: rows.map((row) => normalizeClothingItem(row)),
      });
    }, 'Closet.loadItems');
    set({ loading: false });
  },

  addItem: async (item) => {
    const normalized = normalizeClothingItem(item);

    if (Platform.OS === 'web') {
      set({ items: [normalized, ...get().items] });
      return;
    }

    await safeAsync(async () => {
      await executeSqlWithRetry(
        `INSERT INTO clothing_items
         (id, image_path, category, subcategory, color_hsl, color_hex, color_family,
          pattern, style_type, fit_type, season, user_corrected, ai_confidence, ai_raw_label,
          times_worn, last_worn, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          normalized.id,
          normalized.imagePath,
          normalized.category,
          normalized.subcategory,
          normalized.colorHsl,
          normalized.colorHex,
          normalized.colorFamily,
          normalized.pattern,
          normalized.styleType,
          normalized.fitType,
          normalized.season,
          normalized.userCorrected,
          normalized.aiConfidence,
          normalized.aiRawLabel,
          normalized.timesWorn,
          normalized.lastWorn,
          normalized.createdAt,
        ]
      );
      set({ items: [normalized, ...get().items] });
    }, 'Closet.addItem');
  },

  deleteItem: async (id, imagePath) => {
    if (Platform.OS === 'web') {
      set({ items: get().items.filter((item) => item.id !== id) });
      return;
    }

    const previousItems = get().items;
    set({ items: previousItems.filter((item) => item.id !== id) });

    const { error } = await safeAsync(async () => {
      await executeSqlWithRetry('DELETE FROM clothing_items WHERE id = ?;', [id]);
      if (imagePath) {
        await safeAsync(async () => FileSystem.deleteAsync(imagePath, { idempotent: true }), 'Closet.deleteImageFile');
      }
    }, 'Closet.deleteItem');

    if (error) {
      set({ items: previousItems });
    }
  },

  updateItemImage: async (id, nextImagePath) => {
    if (Platform.OS === 'web') {
      set({
        items: get().items.map((item) => (item.id === id ? { ...item, imagePath: nextImagePath } : item)),
      });
      return;
    }

    const current = get().items;
    const target = current.find((item) => item.id === id);
    if (!target) return;

    const previousPath = target.imagePath;
    set({
      items: current.map((item) => (item.id === id ? { ...item, imagePath: nextImagePath } : item)),
    });

    const { error } = await safeAsync(async () => {
      await executeSqlWithRetry('UPDATE clothing_items SET image_path = ? WHERE id = ?;', [nextImagePath, id]);
      if (previousPath && previousPath !== nextImagePath) {
        await safeAsync(async () => FileSystem.deleteAsync(previousPath, { idempotent: true }), 'Closet.deleteOldImage');
      }
    }, 'Closet.updateItemImage');

    if (error) {
      set({
        items: get().items.map((item) => (item.id === id ? { ...item, imagePath: previousPath } : item)),
      });
      await safeAsync(async () => FileSystem.deleteAsync(nextImagePath, { idempotent: true }), 'Closet.rollbackImage');
    }
  },

  updateItem: async (id, patch) => {
    if (Platform.OS === 'web') {
      set({
        items: get().items.map((item) => {
          if (item.id !== id) return item;
          const isManualOverride = Number(patch.userCorrected ?? item.userCorrected) === 1;
          const merged = item.userCorrected === 1 && !isManualOverride
            ? {
              ...item,
              ...patch,
              category: item.category,
              subcategory: item.subcategory,
              pattern: item.pattern,
              styleType: item.styleType,
              fitType: item.fitType,
              season: item.season,
            }
            : { ...item, ...patch };
          return normalizeClothingItem(merged);
        }),
      });
      return;
    }

    const current = get().items;
    const target = current.find((item) => item.id === id);
    if (!target) return;

    const isManualOverride = Number(patch.userCorrected ?? target.userCorrected) === 1;
    const merged = target.userCorrected === 1 && !isManualOverride
      ? {
        ...target,
        ...patch,
        category: target.category,
        subcategory: target.subcategory,
        pattern: target.pattern,
        styleType: target.styleType,
        fitType: target.fitType,
        season: target.season,
      }
      : { ...target, ...patch };
    const nextItem: ClothingItem = normalizeClothingItem(merged);
    set({ items: current.map((item) => (item.id === id ? nextItem : item)) });

    const { error } = await safeAsync(async () => {
      await executeSqlWithRetry(
        `UPDATE clothing_items
         SET image_path = ?, category = ?, subcategory = ?, color_hsl = ?, color_hex = ?, color_family = ?,
             pattern = ?, style_type = ?, fit_type = ?, season = ?, user_corrected = ?, ai_confidence = ?, ai_raw_label = ?,
             times_worn = ?, last_worn = ?
         WHERE id = ?;`,
        [
          nextItem.imagePath,
          nextItem.category,
          nextItem.subcategory,
          nextItem.colorHsl,
          nextItem.colorHex,
          nextItem.colorFamily,
          nextItem.pattern,
          nextItem.styleType,
          nextItem.fitType,
          nextItem.season,
          nextItem.userCorrected,
          nextItem.aiConfidence,
          nextItem.aiRawLabel,
          nextItem.timesWorn,
          nextItem.lastWorn,
          id,
        ]
      );
    }, 'Closet.updateItem');

    if (error) {
      set({ items: current });
    }
  },

  setFilter: (filter) => set({ filter }),

  migrateCategories: async () => {
    const { items, updateItem } = get();
    for (const item of items) {
      if (!item.userCorrected) {
        const resolved = resolveCategory(item.category || '');
        if (resolved !== item.category) {
          await updateItem(item.id, { category: resolved });
        }
      }
    }
  },
}));
