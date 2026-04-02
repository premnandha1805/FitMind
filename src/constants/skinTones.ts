import { SkinToneColors } from '../types/models';

export const SKIN_TONES = [
  { id: 1, name: 'Very Fair' },
  { id: 2, name: 'Fair' },
  { id: 3, name: 'Medium Light' },
  { id: 4, name: 'Medium' },
  { id: 5, name: 'Medium Dark' },
  { id: 6, name: 'Deep' },
] as const;

interface TonePalette extends SkinToneColors {
  reason: string;
}

const TABLE: Record<string, TonePalette> = {
  '1-Cool': {
    excellentColors: ['#1B3A6B', '#6B2D3E', '#2D5A27', '#D4B5C5', '#E8E4D0'],
    goodColors: ['#4A7FA5', '#7D9B76', '#C4A882', '#8B7B8B', '#5C5C5C'],
    avoidColors: ['#FFD700', '#FF6B00', '#8B4513', '#FF4500'],
    reason: 'Cool tones prevent washing out fair skin',
  },
  '2-Neutral': {
    excellentColors: ['#1B4F8A', '#228B22', '#8B0000', '#FFB6C1', '#F5DEB3'],
    goodColors: ['#FF7F50', '#008080', '#6B8E23', '#F5F5DC', '#708090'],
    avoidColors: ['#F0E6D3', '#D2B48C', '#FAF0E6'],
    reason: 'Neutral skin suits both warm and cool palettes',
  },
  '3-Warm': {
    excellentColors: ['#FF6B35', '#8B6914', '#556B2F', '#FF8C00', '#FFDAB9'],
    goodColors: ['#F5DEB3', '#CD853F', '#8FBC8F', '#B8860B', '#008080'],
    avoidColors: ['#808080', '#B0C4DE', '#F0FFFF', '#FFFAFA'],
    reason: 'Warm earth tones enhance golden undertones',
  },
  '4-Warm': {
    excellentColors: ['#8B4513', '#556B2F', '#008080', '#DAA520', '#B22222'],
    goodColors: ['#6B8E23', '#CD853F', '#4682B4', '#8B7355', '#F4A460'],
    avoidColors: ['#FFB6C1', '#E6E6FA', '#F0E6D3', '#FAEBD7'],
    reason: 'Rich earthy tones create beautiful contrast',
  },
  '4-Neutral': {
    excellentColors: ['#8B4513', '#556B2F', '#008080', '#DAA520', '#B22222'],
    goodColors: ['#6B8E23', '#CD853F', '#4682B4', '#8B7355', '#F4A460'],
    avoidColors: ['#FFB6C1', '#E6E6FA', '#F0E6D3', '#FAEBD7'],
    reason: 'Rich earthy tones create beautiful contrast',
  },
  '5-Warm': {
    excellentColors: ['#FFD700', '#006400', '#8B0000', '#4169E1', '#FF8C00'],
    goodColors: ['#F5DEB3', '#008080', '#800080', '#B8860B', '#FAF0E6'],
    avoidColors: ['#F5F5DC', '#D2B48C', '#BC8F8F', '#C0C0C0'],
    reason: 'Jewel tones and brights create stunning contrast',
  },
  '6-Cool': {
    excellentColors: ['#FFFFFF', '#4169E1', '#DC143C', '#008000', '#800080'],
    goodColors: ['#F5DEB3', '#FF8C00', '#FFD700', '#00CED1', '#F0E68C'],
    avoidColors: ['#4A2912', '#3D1C02', '#2F1B0E', '#8B4513'],
    reason: 'High contrast colors make deep skin radiate',
  },
  '6-Neutral': {
    excellentColors: ['#FFFFFF', '#4169E1', '#DC143C', '#008000', '#800080'],
    goodColors: ['#F5DEB3', '#FF8C00', '#FFD700', '#00CED1', '#F0E68C'],
    avoidColors: ['#4A2912', '#3D1C02', '#2F1B0E', '#8B4513'],
    reason: 'High contrast colors make deep skin radiate',
  },
};

const TONE_FALLBACK_KEY: Record<number, string> = {
  1: '1-Cool',
  2: '2-Neutral',
  3: '3-Warm',
  4: '4-Warm',
  5: '5-Warm',
  6: '6-Neutral',
};

function resolveSkinToneKey(toneId: number, undertone: 'Warm' | 'Cool' | 'Neutral'): string | null {
  const key = `${toneId}-${undertone}`;
  if (TABLE[key]) return key;
  const fallback = TONE_FALLBACK_KEY[toneId];
  if (fallback && TABLE[fallback]) return fallback;
  return TABLE['3-Warm'] ? '3-Warm' : null;
}

export function getSkinToneColorTable(toneId: number, undertone: 'Warm' | 'Cool' | 'Neutral'): SkinToneColors {
  const resolved = resolveSkinToneKey(toneId, undertone);
  return resolved ? TABLE[resolved] : TABLE['3-Warm'];
}

export function getSkinTonePaletteReason(toneId: number, undertone: 'Warm' | 'Cool' | 'Neutral'): string {
  const resolved = resolveSkinToneKey(toneId, undertone);
  return (resolved && TABLE[resolved]?.reason) ?? 'Balanced palette for your tone.';
}
