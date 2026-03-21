import { create } from 'zustand';
import { detectTasteInsights, getLearningProgress, recalculateTasteWeights } from '../services/feedbackEngine';
import { getTasteProfile } from '../services/tasteEngine';
import { TasteInsight, TasteProfile } from '../types/models';
import { safeAsync } from '../utils/safeAsync';

interface TasteState {
  profile: TasteProfile | null;
  insights: TasteInsight[];
  learningProgress: { count: number; nextMilestone: number; accuracyTrend: 'improving' | 'stable' } | null;
  refresh: () => Promise<void>;
  recalc: () => Promise<void>;
}

export const useTasteStore = create<TasteState>((set) => ({
  profile: null,
  insights: [],
  learningProgress: null,
  refresh: async () => {
    const { data } = await safeAsync(async () => getTasteProfile(), 'Taste.refreshProfile');
    const { data: insights } = await safeAsync(async () => detectTasteInsights(), 'Taste.refreshInsights');
    const { data: progress } = await safeAsync(async () => getLearningProgress(), 'Taste.refreshProgress');
    if (data) set({ profile: data });
    if (insights) set({ insights });
    if (progress) set({ learningProgress: progress });
  },
  recalc: async () => {
    await safeAsync(async () => recalculateTasteWeights(), 'Taste.recalculate');
    const { data } = await safeAsync(async () => getTasteProfile(), 'Taste.recalcProfile');
    const { data: insights } = await safeAsync(async () => detectTasteInsights(), 'Taste.recalcInsights');
    const { data: progress } = await safeAsync(async () => getLearningProgress(), 'Taste.recalcProgress');
    if (data) set({ profile: data });
    if (insights) set({ insights });
    if (progress) set({ learningProgress: progress });
  },
}));
