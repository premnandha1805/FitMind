import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Category, PatternType } from '../types/models';

export interface AutoTags {
  category: Category;
  pattern: PatternType;
  confidence: 'low' | 'medium' | 'high';
}

type LabelItem = { text: string };
type LabelFn = (imageUri: string) => Promise<LabelItem[]>;

let cachedLabelFn: LabelFn | null | undefined;

const CATEGORY_TOKENS: Record<Category, string[]> = {
  shoes: ['shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'heel', 'heels', 'loafer', 'loafers', 'sandal', 'sandals', 'slipper', 'slippers', 'footwear'],
  bottom: ['pant', 'pants', 'trouser', 'trousers', 'jean', 'jeans', 'short', 'shorts', 'skirt', 'skirts', 'denim', 'leggings'],
  top: ['shirt', 'shirts', 'top', 'tops', 't-shirt', 'tshirts', 'tee', 'blouse', 'blouses', 'sweater', 'sweaters', 'polo', 'polos', 'kurti'],
  outerwear: ['jacket', 'jackets', 'coat', 'coats', 'hoodie', 'hoodies', 'blazer', 'blazers', 'cardigan', 'cardigans', 'parka', 'parkas', 'windbreaker', 'windbreakers'],
  accessory: ['bag', 'bags', 'belt', 'belts', 'watch', 'watches', 'accessory', 'accessories', 'scarf', 'scarves', 'hat', 'hats', 'cap', 'caps', 'jewelry'],
};

function tokenizeLabels(labels: string[]): { wordSet: Set<string>; normalized: string } {
  const normalized = labels.join(' ').toLowerCase();
  const words = normalized
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  return {
    wordSet: new Set(words),
    normalized,
  };
}

function computeCategoryScores(labels: string[]): Record<Category, number> {
  const { wordSet, normalized } = tokenizeLabels(labels);
  const scores: Record<Category, number> = {
    top: 0,
    bottom: 0,
    shoes: 0,
    accessory: 0,
    outerwear: 0,
  };

  (Object.keys(CATEGORY_TOKENS) as Category[]).forEach((category) => {
    CATEGORY_TOKENS[category].forEach((token) => {
      if (token.includes('-')) {
        if (normalized.includes(token)) {
          scores[category] += 1;
        }
      } else if (wordSet.has(token)) {
        scores[category] += 1;
      }
    });
  });

  return scores;
}

function mapCategory(labels: string[]): Category {
  const scores = computeCategoryScores(labels);

  const orderedByPriority: Category[] = ['shoes', 'bottom', 'outerwear', 'accessory', 'top'];
  const winner = orderedByPriority.reduce<{ category: Category; score: number }>(
    (best, category) => {
      const score = scores[category];
      if (score > best.score) {
        return { category, score };
      }
      return best;
    },
    { category: 'top', score: 0 }
  );

  return winner.score > 0 ? winner.category : 'top';
}

function estimateCategoryConfidence(labels: string[]): 'low' | 'medium' | 'high' {
  const scores: number[] = Object.values(computeCategoryScores(labels))
    .sort((a, b) => b - a);

  const top = scores[0] ?? 0;
  const second = scores[1] ?? 0;
  const gap = top - second;

  if (top >= 2 && gap >= 2) return 'high';
  if (top >= 1 && gap >= 1) return 'medium';
  return 'low';
}

function mapPattern(labels: string[]): PatternType {
  const lower = labels.join(' ').toLowerCase();
  if (lower.includes('floral') || lower.includes('striped') || lower.includes('plaid') || lower.includes('print')) return 'bold';
  if (lower.includes('texture') || lower.includes('check')) return 'subtle';
  if (lower.includes('solid') || lower.includes('plain')) return 'solid';
  return 'unknown';
}

async function getLabelFn(): Promise<LabelFn | null> {
  if (cachedLabelFn !== undefined) {
    return cachedLabelFn;
  }

  // Expo Go cannot load this native module because it is not compiled into Expo Go.
  if (Constants.appOwnership === 'expo') {
    cachedLabelFn = null;
    return null;
  }

  if (Platform.OS === 'web') {
    cachedLabelFn = null;
    return null;
  }

  try {
    const mod = await import('@react-native-ml-kit/image-labeling');
    const candidate = (mod as { default?: { label?: LabelFn }; label?: LabelFn }).default?.label
      ?? (mod as { default?: { label?: LabelFn }; label?: LabelFn }).label
      ?? null;
    cachedLabelFn = candidate;
    return candidate;
  } catch {
    cachedLabelFn = null;
    return null;
  }
}

export async function autoTagClothing(imageUri: string): Promise<AutoTags> {
  const labelFn = await getLabelFn();
  if (!labelFn) {
    return { category: 'top', pattern: 'unknown', confidence: 'low' };
  }

  let data: LabelItem[] | null = null;
  try {
    data = await labelFn(imageUri);
  } catch {
    // Some runtimes (for example Expo Go) do not link this native module.
    // Fallback keeps capture flow working without a blocking redbox.
    data = null;
  }

  if (!data) {
    return { category: 'top', pattern: 'unknown', confidence: 'low' };
  }

  const labels = data.map((item: { text: string }) => item.text);
  return {
    category: mapCategory(labels),
    pattern: mapPattern(labels),
    confidence: estimateCategoryConfidence(labels),
  };
}
