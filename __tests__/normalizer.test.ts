import { normalizeClothingItem } from '../src/utils/normalizer';

describe('normalizeClothingItem', () => {
  test('maps database row shape into app model', () => {
    const normalized = normalizeClothingItem({
      id: 'item-1',
      image_path: 'file:///shirt.jpg',
      category: 't-shirt' as any,
      subcategory: 'Tee',
      color_hex: '#369',
      pattern: 'stripe',
      style_type: 'business',
      fit_type: 'slim',
      season: 'summer',
      user_corrected: 0,
      ai_confidence: 0.8,
      ai_raw_label: 't-shirt',
      times_worn: 2,
      last_worn: '2026-01-01',
      created_at: '2026-01-01',
    });

    expect(normalized).toMatchObject({
      id: 'item-1',
      imagePath: 'file:///shirt.jpg',
      category: 'top',
      colorHex: '#336699',
      pattern: 'stripes',
      styleType: 'professional',
      fitType: 'slim',
      season: 'summer',
      aiConfidence: 0.8,
      timesWorn: 2,
    });
  });

  test('preserves strict manual category and style corrections', () => {
    const normalized = normalizeClothingItem({
      id: 'manual-1',
      category: 'outerwear',
      styleType: 'formal',
      userCorrected: 1,
      colorHex: 'bad-value',
    });

    expect(normalized.category).toBe('outerwear');
    expect(normalized.styleType).toBe('formal');
    expect(normalized.colorHex).toBe('#808080');
  });
});
