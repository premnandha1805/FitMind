import { item, tasteProfile, userProfile } from './fixtures';

jest.mock('../src/db/queries', () => ({
  getAll: jest.fn(async () => []),
}));

jest.mock('../src/services/gemini', () => ({
  validateWithGemini: jest.fn(async (candidates: unknown[]) => candidates.map((_candidate, index) => ({
    index,
    score: 8,
    reason: `AI-safe rating ${index}`,
  }))),
}));

jest.mock('../src/services/feedbackEngine', () => ({
  recalculateTasteWeights: jest.fn(async () => undefined),
}));

describe('outfitEngine', () => {
  const outfitEngine = require('../src/services/outfitEngine') as typeof import('../src/services/outfitEngine');

  const closet = [
    item({ id: 'top-blue', category: 'top', styleType: 'casual', colorHex: '#336699', colorHsl: 'hsl(210,40,45)', colorFamily: 'blue' }),
    item({ id: 'top-white', category: 'top', styleType: 'professional', colorHex: '#ffffff', colorHsl: 'hsl(0,0,98)', colorFamily: 'white' }),
    item({ id: 'bottom-brown', category: 'bottom', styleType: 'casual', colorHex: '#70543d', colorHsl: 'hsl(27,30,34)', colorFamily: 'brown' }),
    item({ id: 'bottom-black', category: 'bottom', styleType: 'professional', colorHex: '#111111', colorHsl: 'hsl(0,0,7)', colorFamily: 'black' }),
    item({ id: 'shoe-black', category: 'shoes', styleType: 'formal', colorHex: '#111111', colorHsl: 'hsl(0,0,7)', colorFamily: 'black' }),
    item({ id: 'watch', category: 'accessory', styleType: 'formal', colorHex: '#c9a96e', colorHsl: 'hsl(39,46,61)', colorFamily: 'yellow' }),
  ];

  test('resolveOccasion maps natural language to canonical occasion', () => {
    expect(outfitEngine.resolveOccasion('campus class')).toBe('college');
    expect(outfitEngine.resolveOccasion('job interview tomorrow')).toBe('professional');
    expect(outfitEngine.resolveOccasion('unknown thing')).toBe('casual');
  });

  test('buildCombinations only uses real closet items', () => {
    const combos = outfitEngine.buildCombinations(closet, 'casual', 'summer');
    const closetIds = new Set(closet.map((piece) => piece.id));

    expect(combos.length).toBeGreaterThan(0);
    combos.forEach((combo) => {
      [combo.top, combo.bottom, combo.shoes, combo.accessory, combo.outerwear]
        .filter(Boolean)
        .forEach((piece: any) => expect(closetIds.has(piece.id)).toBe(true));
    });
  });

  test('generateOutfits returns no hallucinated placeholder items', async () => {
    const outfits = await outfitEngine.generateOutfits('casual', closet, userProfile, tasteProfile);
    const closetIds = new Set(closet.map((piece) => piece.id));

    expect(outfits.length).toBeGreaterThan(0);
    outfits.forEach((outfit) => {
      expect(outfit.reasons.join(' ')).toMatch(/Confidence/);
      outfit.itemIds.forEach((id) => {
        expect(id.startsWith('placeholder-')).toBe(false);
        expect(closetIds.has(id)).toBe(true);
      });
    });
  });

  test('generateOutfits refuses incomplete closet instead of inventing garments', async () => {
    const noBottoms = closet.filter((piece) => piece.category !== 'bottom');
    await expect(outfitEngine.generateOutfits('casual', noBottoms, userProfile, tasteProfile)).resolves.toEqual([]);
    expect(outfitEngine.generateFallbackOutfits(noBottoms)).toEqual([]);
  });

  test('buildAroundItem keeps anchor and only picks closet items', async () => {
    const outfits = await outfitEngine.buildAroundItem(closet[0], closet, 'casual', userProfile, tasteProfile);
    const closetIds = new Set(closet.map((piece) => piece.id));

    expect(outfits.length).toBeGreaterThan(0);
    outfits.forEach((outfit) => {
      expect(outfit.itemIds).toContain('top-blue');
      outfit.itemIds.forEach((id) => expect(closetIds.has(id)).toBe(true));
    });
  });
});
