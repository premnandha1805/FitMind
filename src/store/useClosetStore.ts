import { create } from 'zustand';
import { ClothingItem } from '../types/models';
import { executeSqlWithRetry, getAll } from '../db/queries';
import { safeAsync } from '../utils/safeAsync';
import * as FileSystem from 'expo-file-system/legacy';

interface ClosetState {
  items: ClothingItem[];
  loading: boolean;
  filter: 'all' | 'top' | 'bottom' | 'shoes' | 'accessory';
  loadItems: () => Promise<void>;
  addItem: (item: ClothingItem) => Promise<void>;
  deleteItem: (id: string, imagePath?: string) => Promise<void>;
  updateItemImage: (id: string, nextImagePath: string) => Promise<void>;
  setFilter: (filter: ClosetState['filter']) => void;
}

export const useClosetStore = create<ClosetState>((set, get) => ({
  items: [],
  loading: false,
  filter: 'all',

  loadItems: async () => {
    set({ loading: true });
    await safeAsync(async () => {
      const rows = await getAll<{
        id: string;
        image_path: string;
        category: ClothingItem['category'];
        color_hsl: string;
        color_hex: string;
        pattern: string | null;
        style_type: string;
        season: string | null;
        times_worn: number;
        last_worn: string | null;
        created_at: string;
      }>('SELECT * FROM clothing_items ORDER BY created_at DESC;');

      set({
        items: rows.map((row) => ({
          id: row.id,
          imagePath: row.image_path,
          category: row.category,
          colorHsl: row.color_hsl,
          colorHex: row.color_hex,
          pattern: row.pattern,
          styleType: row.style_type,
          season: row.season,
          timesWorn: row.times_worn,
          lastWorn: row.last_worn,
          createdAt: row.created_at,
        })),
      });
    }, 'Closet.loadItems');
    set({ loading: false });
  },

  addItem: async (item) => {
    await safeAsync(async () => {
      await executeSqlWithRetry(
        `INSERT INTO clothing_items
         (id, image_path, category, color_hsl, color_hex, pattern, style_type, season, times_worn, last_worn, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          item.id,
          item.imagePath,
          item.category,
          item.colorHsl,
          item.colorHex,
          item.pattern,
          item.styleType,
          item.season,
          item.timesWorn,
          item.lastWorn,
          item.createdAt,
        ]
      );
      set({ items: [item, ...get().items] });
    }, 'Closet.addItem');
  },

  deleteItem: async (id, imagePath) => {
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

  setFilter: (filter) => set({ filter }),
}));
