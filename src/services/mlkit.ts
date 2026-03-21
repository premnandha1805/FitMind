import ImageLabeling from '@react-native-ml-kit/image-labeling';
import { Category, PatternType } from '../types/models';
import { safeAsync } from '../utils/safeAsync';

export interface AutoTags {
  category: Category;
  pattern: PatternType;
}

function mapCategory(labels: string[]): Category {
  const lower = labels.join(' ').toLowerCase();
  if (lower.includes('shoe') || lower.includes('sneaker') || lower.includes('boot')) return 'shoes';
  if (lower.includes('pant') || lower.includes('trouser') || lower.includes('jean') || lower.includes('short')) return 'bottom';
  if (lower.includes('shirt') || lower.includes('top') || lower.includes('t-shirt') || lower.includes('blouse')) return 'top';
  if (lower.includes('jacket') || lower.includes('coat') || lower.includes('hoodie')) return 'outerwear';
  if (lower.includes('bag') || lower.includes('belt') || lower.includes('watch') || lower.includes('accessory')) return 'accessory';
  return 'other';
}

function mapPattern(labels: string[]): PatternType {
  const lower = labels.join(' ').toLowerCase();
  if (lower.includes('floral') || lower.includes('striped') || lower.includes('plaid') || lower.includes('print')) return 'bold';
  if (lower.includes('texture') || lower.includes('check')) return 'subtle';
  if (lower.includes('solid') || lower.includes('plain')) return 'solid';
  return 'unknown';
}

export async function autoTagClothing(imageUri: string): Promise<AutoTags> {
  const { data, error } = await safeAsync(
    async () => ImageLabeling.label(imageUri),
    'autoTagClothing.detect'
  );

  if (error || !data) {
    return { category: 'other', pattern: 'unknown' };
  }

  const labels = data.map((item: { text: string }) => item.text);
  return {
    category: mapCategory(labels),
    pattern: mapPattern(labels),
  };
}
