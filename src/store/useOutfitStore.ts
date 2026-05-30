import { create } from 'zustand';
import { Platform } from 'react-native';
import { executeSqlWithRetry, executeTransactionWithRetry } from '../db/queries';
import { buildAroundItem, safeGenerateOutfits } from '../services/outfitEngine';
import { ClothingItem, Outfit, TasteProfile, UserProfile } from '../types/models';
import { safeAsync } from '../utils/safeAsync';

interface OutfitState {
  outfits: Outfit[];
  loading: boolean;
  note: string | null;
  candidatePool: string[];
  generate: (occasion: string, closetItems: ClothingItem[], user: UserProfile, taste: TasteProfile) => Promise<void>;
  generateSafe: (occasion: string, closetItems: ClothingItem[], user: UserProfile, taste: TasteProfile) => Promise<void>;
  generateAroundItem: (anchorItem: ClothingItem, occasion: string, closetItems: ClothingItem[], user: UserProfile, taste: TasteProfile) => Promise<void>;
  setOutfits: (outfits: Outfit[], note?: string | null) => void;
}

let activeGenerationKey: string | null = null;

export const useOutfitStore = create<OutfitState>((set) => {
  const runGenerate = async (occasion: string, closetItems: ClothingItem[], user: UserProfile, taste: TasteProfile) => {
    if (Platform.OS === 'web') {
      set({ outfits: [], loading: false, note: null, candidatePool: [] });
      return;
    }

    const tops = closetItems.filter((item) => item.category === 'top');
    const bottoms = closetItems.filter((item) => item.category === 'bottom');
    const shoes = closetItems.filter((item) => item.category === 'shoes');
    const accessories = closetItems.filter((item) => item.category === 'accessory');
    const candidatePool: string[] = [];
    const generationKey = [
      occasion.trim().toLowerCase(),
      user.skinToneId,
      user.skinUndertone,
      closetItems.map((item) => `${item.id}:${(item as ClothingItem & { updatedAt?: string }).updatedAt ?? item.createdAt}`).sort().join(','),
    ].join('|');

    if (activeGenerationKey === generationKey) {
      return;
    }

    if (tops.length < 1 || bottoms.length < 1) {
      set({ outfits: [], loading: false, note: 'Add at least one top and one bottom to generate outfits', candidatePool: [] });
      return;
    }

    tops.forEach((top) => {
      bottoms.forEach((bottom) => {
        const shoe = shoes[0]?.id ?? 'none';
        const accessory = accessories[0]?.id ?? 'none';
        if (candidatePool.length < 50) {
          candidatePool.push([top.id, bottom.id, shoe, accessory].join('|'));
        }
      });
    });

    set({ loading: true, note: null, candidatePool });
    activeGenerationKey = generationKey;
    const { data, error } = await safeAsync(
      async () => safeGenerateOutfits(occasion, closetItems, user, taste),
      'Outfit.generate'
    );
    activeGenerationKey = null;

    if (error || !data) {
      set({ loading: false, note: 'We are still learning your taste - add more feedback.', candidatePool: [] });
      return;
    }

    if (!data.length) {
      set({ outfits: [], loading: false, note: 'Add at least one top and one bottom to generate outfits', candidatePool: [] });
      return;
    }

    const queries = data.map((outfit) => ({
      sql: `INSERT OR REPLACE INTO outfits
            (id, occasion, item_ids, color_score, skin_score, gemini_score, final_score, worn_on, liked, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        outfit.id,
        outfit.occasion,
        JSON.stringify(outfit.itemIds),
        Math.round(outfit.colorScore),
        Math.round(outfit.skinScore),
        Math.round(outfit.geminiScore),
        Math.round(outfit.finalScore),
        outfit.wornOn,
        outfit.liked,
        outfit.createdAt,
      ],
    }));

    await safeAsync(
      async () => executeTransactionWithRetry(queries),
      'Outfit.saveTransaction'
    );

    set({ outfits: data.slice(0, 3), loading: false, candidatePool: [] });
  };

  return {
    outfits: [],
    loading: false,
    note: null,
    candidatePool: [],
    setOutfits: (outfits, note = null) => set({ outfits, note, loading: false }),
    generate: runGenerate,
    generateSafe: runGenerate,
    generateAroundItem: async (anchorItem, occasion, closetItems, user, taste) => {
    set({ loading: true, note: null });
    const { data } = await safeAsync(
      async () => buildAroundItem(anchorItem, closetItems, occasion, user, taste),
      'Outfit.generateAroundItem'
    );
    set({ outfits: data ?? [], loading: false, note: data?.length ? `Built around ${anchorItem.subcategory}` : 'Could not build around this item.' });
    },
  };
});
