import { create } from 'zustand';
import { executeSqlWithRetry } from '../db/queries';
import { generateOutfits } from '../services/outfitEngine';
import { ClothingItem, Outfit, TasteProfile, UserProfile } from '../types/models';
import { safeAsync } from '../utils/safeAsync';

interface OutfitState {
  outfits: Outfit[];
  loading: boolean;
  note: string | null;
  candidatePool: string[];
  generate: (occasion: string, closetItems: ClothingItem[], user: UserProfile, taste: TasteProfile) => Promise<void>;
}

export const useOutfitStore = create<OutfitState>((set) => ({
  outfits: [],
  loading: false,
  note: null,
  candidatePool: [],
  generate: async (occasion, closetItems, user, taste) => {
    const tops = closetItems.filter((item) => item.category === 'top');
    const bottoms = closetItems.filter((item) => item.category === 'bottom');
    const shoes = closetItems.filter((item) => item.category === 'shoes');
    const accessories = closetItems.filter((item) => item.category === 'accessory');
    const candidatePool: string[] = [];

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
    const { data, error } = await safeAsync(
      async () => generateOutfits(occasion, closetItems, user, taste),
      'Outfit.generate'
    );

    if (error || !data) {
      set({ loading: false, note: 'We are still learning your taste - add more feedback.', candidatePool: [] });
      return;
    }

    if (!data.length) {
      set({ outfits: [], loading: false, note: 'Add at least one top and one bottom to generate outfits', candidatePool: [] });
      return;
    }

    await Promise.all(data.map((outfit) => safeAsync(async () => {
      await executeSqlWithRetry(
        `INSERT OR REPLACE INTO outfits
         (id, occasion, item_ids, color_score, skin_score, gemini_score, final_score, worn_on, liked, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
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
        ]
      );
    }, 'Outfit.saveResult')));

    set({ outfits: data.slice(0, 3), loading: false, candidatePool: [] });
  },
}));
