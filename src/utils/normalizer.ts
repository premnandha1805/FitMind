import { randomUUID } from 'expo-crypto';
import { resolveCategory, normalizePattern, normalizeStyle } from '../constants/categoryMap';
import { ClothingItem, ColorFamily, FitType } from '../types/models';

type RawClothingItem = Partial<ClothingItem> & {
  image_path?: string;
  subcategory?: string;
  color_hsl?: string;
  color_hex?: string;
  color_family?: ColorFamily;
  style_type?: string;
  fit_type?: FitType;
  user_corrected?: number;
  ai_confidence?: number;
  ai_raw_label?: string;
  times_worn?: number;
  last_worn?: string | null;
  created_at?: string;
};

function normalizeHex(hex: string): string {
  const clean = hex.trim().replace('#', '');
  if (clean.length === 3) {
    return `#${clean.split('').map((x) => `${x}${x}`).join('').toLowerCase()}`;
  }
  if (clean.length !== 6) return '#808080';
  return `#${clean.toLowerCase()}`;
}

function getColorFamily(hex: string): ColorFamily {
  const clean = normalizeHex(hex).slice(1);
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (max < 25) return 'black';
  if (min > 235) return 'white';

  const lightness = ((max + min) / 510) * 100;
  const saturation = max === 0 ? 0 : (delta / max) * 100;

  if (saturation < 12) return 'grey';
  if (saturation < 20) return 'neutral';

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }

  hue = (hue * 60 + 360) % 360;

  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 250) return 'blue';
  if (hue < 290) return 'purple';
  if (hue < 345) return 'pink';
  return lightness > 55 ? 'warm' : 'cool';
}

function normalizeFitType(raw: string): FitType {
  const clean = raw.toLowerCase().trim();
  if (clean === 'slim' || clean === 'regular' || clean === 'relaxed' || clean === 'oversized' || clean === 'fitted') {
    return clean;
  }
  return 'regular';
}

function normalizeSeason(raw: string): ClothingItem['season'] {
  const clean = raw.toLowerCase().trim();
  if (clean === 'summer' || clean === 'winter' || clean === 'spring' || clean === 'autumn' || clean === 'all-season') {
    return clean;
  }
  return 'all-season';
}

function isStrictCategory(raw: string): raw is ClothingItem['category'] {
  return raw === 'top' || raw === 'bottom' || raw === 'shoes' || raw === 'accessory' || raw === 'outerwear';
}

function isStrictStyle(raw: string): raw is ClothingItem['styleType'] {
  return raw === 'casual'
    || raw === 'formal'
    || raw === 'party'
    || raw === 'ethnic'
    || raw === 'professional'
    || raw === 'sports'
    || raw === 'smart_casual';
}

function generateId(): string {
  try {
    return `item-${randomUUID()}`;
  } catch {
    return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function normalizeClothingItem(raw: RawClothingItem): ClothingItem {
  const isUserCorrected = Number(raw.userCorrected ?? raw.user_corrected ?? 0) === 1;
  const sourceCategory = String(raw.category ?? '').trim();
  const sourceStyle = String(raw.styleType ?? raw.style_type ?? '').trim();
  const normalizedHex = normalizeHex(String(raw.colorHex ?? raw.color_hex ?? '#808080'));
  const correctedCategory = sourceCategory.toLowerCase();
  const correctedStyle = sourceStyle.toLowerCase();

  return {
    id: raw.id || generateId(),
    imagePath: String(raw.imagePath ?? raw.image_path ?? ''),
    category: isUserCorrected && isStrictCategory(correctedCategory)
      ? correctedCategory
      : resolveCategory(sourceCategory),
    subcategory: String(raw.subcategory ?? raw.aiRawLabel ?? raw.ai_raw_label ?? 'general').trim() || 'general',
    colorHsl: String(raw.colorHsl ?? raw.color_hsl ?? 'hsl(0,0%,50%)'),
    colorHex: normalizedHex,
    colorFamily: (raw.colorFamily ?? raw.color_family) || getColorFamily(normalizedHex),
    pattern: normalizePattern(String(raw.pattern ?? 'solid')),
    styleType: isUserCorrected && isStrictStyle(correctedStyle)
      ? correctedStyle
      : normalizeStyle(sourceStyle || 'casual'),
    fitType: normalizeFitType(String(raw.fitType ?? raw.fit_type ?? 'regular')),
    season: normalizeSeason(String(raw.season ?? 'all-season')),
    userCorrected: Number(raw.userCorrected ?? raw.user_corrected ?? 0),
    aiConfidence: Number(raw.aiConfidence ?? raw.ai_confidence ?? 0),
    aiRawLabel: String(raw.aiRawLabel ?? raw.ai_raw_label ?? ''),
    timesWorn: Number(raw.timesWorn ?? raw.times_worn ?? 0),
    lastWorn: (raw.lastWorn ?? raw.last_worn ?? null) as string | null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
  };
}
