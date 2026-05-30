import { ClothingItem, OutfitCandidate, TasteProfile, UserProfile } from '../src/types/models';

export function item(overrides: Partial<ClothingItem> = {}): ClothingItem {
  const id = overrides.id ?? `item-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    imagePath: `file:///${id}.jpg`,
    category: 'top',
    subcategory: 'shirt',
    colorHsl: 'hsl(210,40,45)',
    colorHex: '#336699',
    colorFamily: 'blue',
    pattern: 'solid',
    styleType: 'casual',
    fitType: 'regular',
    season: 'all-season',
    userCorrected: 0,
    aiConfidence: 0.9,
    aiRawLabel: 'shirt',
    timesWorn: 0,
    lastWorn: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function candidate(overrides: Partial<OutfitCandidate> = {}): OutfitCandidate {
  const top = overrides.top ?? item({ id: 'top-1', category: 'top' });
  const bottom = overrides.bottom ?? item({ id: 'bottom-1', category: 'bottom', colorHsl: 'hsl(30,30,35)', colorHex: '#70543d', colorFamily: 'brown' });
  return {
    top,
    bottom,
    shoes: overrides.shoes ?? item({ id: 'shoe-1', category: 'shoes', colorHsl: 'hsl(0,0,10)', colorHex: '#111111', colorFamily: 'black' }),
    accessory: overrides.accessory ?? null,
    outerwear: overrides.outerwear ?? null,
    layer1Score: overrides.layer1Score ?? 7,
    layer2Score: overrides.layer2Score ?? 7,
    layer3Score: overrides.layer3Score ?? 7,
    geminiScore: overrides.geminiScore ?? 7,
    finalScore: overrides.finalScore ?? 7,
    reasons: overrides.reasons ?? [],
  };
}

export const userProfile: UserProfile = {
  id: 'user',
  skinToneId: 3,
  skinUndertone: 'Warm',
  skinImagePath: null,
  onboarded: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const tasteProfile: TasteProfile = {
  contrastPreference: 0.5,
  warmCoolBias: 0.5,
  patternTolerance: 0.5,
  accessoryInterest: 0.7,
  formalityComfort: 0.5,
  skinToneWeight: 0.6,
  boldnessPreference: 0.5,
  layeringPreference: 0.4,
  feedbackCount: 0,
  lastUpdated: null,
  lovedColors: [],
  dislikedColors: [],
  lovedPatterns: [],
  dislikedPatterns: [],
  fitPreference: 'relaxed',
  styleIdentity: 'classic',
  blockedPatterns: [],
};
