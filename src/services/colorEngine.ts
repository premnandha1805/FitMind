import { COLOR_HEX_MAP } from '../constants/colorPalettes';
import { ClothingItem, OutfitCandidate, OutfitComposition, Undertone } from '../types/models';
import { hexToRgb, hueDiff, rgbToHsl } from '../utils/colorUtils';
import { getSkinToneColors } from './skinToneEngine';

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export interface OutfitScore {
  colorHarmony: number;
  skinCompatibility: number;
  contrastBalance: number;
  patternMix: number;
  occasionFit: number;
  sixtythirtyten: number;
  total: number;
}

const SEASONAL_RULES: Record<Season, { best: string; avoid: string }> = {
  Spring: { best: 'warm clear bright', avoid: 'muted dusty dark' },
  Summer: { best: 'cool soft muted', avoid: 'warm bright orange' },
  Autumn: { best: 'warm muted earthy', avoid: 'cool icy bright' },
  Winter: { best: 'cool clear icy', avoid: 'warm muted earthy' },
};

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, value));
}

function normalizeUndertone(value: string): 'warm' | 'cool' | 'neutral' {
  const lower = value.trim().toLowerCase();
  if (lower === 'warm') return 'warm';
  if (lower === 'cool') return 'cool';
  return 'neutral';
}

function toUndertoneLabel(value: string): Undertone {
  const normalized = normalizeUndertone(value);
  if (normalized === 'warm') return 'Warm';
  if (normalized === 'cool') return 'Cool';
  return 'Neutral';
}

function normalizeHex(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return `#${clean.split('').map((x) => `${x}${x}`).join('').toUpperCase()}`;
  }
  return `#${clean.toUpperCase()}`;
}

function toHslObject(input: { h: number; s: number; l: number } | string): { h: number; s: number; l: number } {
  if (typeof input === 'string') return parseHSL(input);
  return input;
}

function candidateToItems(outfit: OutfitCandidate | any): ClothingItem[] {
  if (!outfit || typeof outfit !== 'object') return [];
  if (Array.isArray(outfit)) return outfit as ClothingItem[];

  const asCandidate = outfit as OutfitCandidate;
  return [asCandidate.top, asCandidate.bottom, asCandidate.shoes, asCandidate.accessory, asCandidate.outerwear]
    .filter((x): x is ClothingItem => Boolean(x));
}

function getItemHsl(item: ClothingItem | any): { h: number; s: number; l: number } {
  const raw = typeof item?.colorHsl === 'string'
    ? item.colorHsl
    : typeof item?.color_hsl === 'string'
      ? item.color_hsl
      : 'hsl(0,0,50)';
  return parseHSL(raw);
}

function getItemHex(item: ClothingItem | any): string {
  const raw = typeof item?.colorHex === 'string'
    ? item.colorHex
    : typeof item?.color_hex === 'string'
      ? item.color_hex
      : '#808080';
  return normalizeHex(raw);
}

function getColorName(hex: string): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  let closest = 'neutral';
  let smallest = Number.POSITIVE_INFINITY;

  Object.entries(COLOR_HEX_MAP).forEach(([name, value]) => {
    const c = hexToRgb(value);
    const chsl = rgbToHsl(c.r, c.g, c.b);
    const d = hueDiff(hsl.h, chsl.h) + Math.abs(hsl.s - chsl.s) * 0.05 + Math.abs(hsl.l - chsl.l) * 0.05;
    if (d < smallest) {
      smallest = d;
      closest = name;
    }
  });

  return closest;
}

export function getSeasonalPalette(toneId: number, undertone: string): Season {
  const under = normalizeUndertone(undertone);
  if (toneId <= 2 && under === 'cool') return 'Summer';
  if (toneId <= 2 && under === 'warm') return 'Spring';
  if (toneId >= 3 && under === 'warm') return 'Autumn';
  return 'Winter';
}

export function parseHSL(colorHsl: string): { h: number; s: number; l: number } {
  const values = colorHsl.replace('hsl(', '').replace(')', '').split(',').map((x) => Number.parseFloat(x));
  return { h: values[0] ?? 0, s: values[1] ?? 0, l: values[2] ?? 0 };
}

export function isComplementary(hsl1: { h: number }, hsl2: { h: number }): boolean {
  const diff = hueDiff(hsl1.h, hsl2.h);
  return diff >= 150 && diff <= 210;
}

export function isAnalogous(hsl1: { h: number }, hsl2: { h: number }): boolean {
  return hueDiff(hsl1.h, hsl2.h) <= 60;
}

export function isNeutral(hsl: { s: number }): boolean {
  return hsl.s < 15;
}

export function isStatementPiece(hsl: { s: number }): boolean {
  return hsl.s > 50;
}

export function scoreColorHarmony(items: ClothingItem[] | Array<{ colorHsl?: string; color_hsl?: string }>): number {
  if (items.length < 2) return 8;

  const hsls = items.map((item) => getItemHsl(item));
  let score = 10;

  for (let i = 0; i < hsls.length - 1; i += 1) {
    const current = hsls[i];
    const next = hsls[i + 1];
    const diff = Math.abs(current.h - next.h);
    const normalized = diff > 180 ? 360 - diff : diff;

    if (normalized >= 150 && normalized <= 210) score = Math.max(score, 9);
    else if (normalized <= 60) score = Math.max(score, 8.5);
    else if (normalized >= 110 && normalized <= 130) score = Math.max(score, 8);
    else if (normalized >= 60 && normalized <= 90) score = Math.min(score, 7);
    else score = Math.min(score, 5);

    if ((current.s / 100) > 0.5 && (next.s / 100) > 0.5 && normalized > 60) {
      score -= 2;
    }
  }

  return clampScore(score);
}

export function scoreColorPair(hsl1: { h: number; s: number; l: number } | string, hsl2: { h: number; s: number; l: number } | string): number {
  const first = toHslObject(hsl1);
  const second = toHslObject(hsl2);
  const diff = hueDiff(first.h, second.h);

  let score = 6;
  if (diff >= 150 && diff <= 210) score = 9;
  else if (diff <= 60) score = 8.5;
  else if (diff >= 110 && diff <= 130) score = 8;
  else if (diff >= 60 && diff <= 90) score = 7;
  else score = 5;

  if ((first.s / 100) > 0.5 && (second.s / 100) > 0.5 && diff > 60) {
    score -= 2;
  }

  return clampScore(score);
}

export function apply60_30_10Rule(items: OutfitCandidate): OutfitComposition {
  const bottomHsl = parseHSL(items.bottom.colorHsl);
  const topHsl = parseHSL(items.top.colorHsl);
  const accentItem = items.accessory ?? items.shoes;
  const accentHsl = accentItem ? parseHSL(accentItem.colorHsl) : null;

  let ruleScoreAdjustment = 0;
  if (bottomHsl.s > 50) ruleScoreAdjustment -= 2;
  if (accentHsl && isComplementary(topHsl, accentHsl)) ruleScoreAdjustment += 2;

  return {
    dominant: items.bottom,
    secondary: items.top,
    accent: accentItem,
    ruleScoreAdjustment,
  };
}

export function colorSimilar(hex1: string, hex2: string, threshold = 40): boolean {
  const rgb1 = hexToRgb(normalizeHex(hex1));
  const rgb2 = hexToRgb(normalizeHex(hex2));
  const distance = Math.sqrt(
    ((rgb1.r - rgb2.r) ** 2) * 0.30
    + ((rgb1.g - rgb2.g) ** 2) * 0.59
    + ((rgb1.b - rgb2.b) ** 2) * 0.11
  );
  return distance < threshold;
}

export function scoreSkinCompatibility(items: ClothingItem[] | any[], toneId: number, undertone: string): number {
  if (!items.length) return 5;
  const palette = getSkinToneColors(toneId, toUndertoneLabel(undertone));

  let score = 0;
  items.forEach((item) => {
    const itemHex = getItemHex(item);
    if (palette.excellentColors.some((c) => colorSimilar(itemHex, c))) score += 3;
    else if (palette.goodColors.some((c) => colorSimilar(itemHex, c))) score += 1.5;
    else if (palette.avoidColors.some((c) => colorSimilar(itemHex, c))) score -= 2.5;
    else score += 0.5;
  });

  return clampScore((score / items.length) * 3 + 5);
}

export function scoreContrastBalance(items: ClothingItem[] | any[], toneId: number): number {
  if (!items.length) return 5;
  const lightness = items.map((item) => getItemHsl(item).l / 100);
  const maxL = Math.max(...lightness);
  const minL = Math.min(...lightness);
  const contrast = maxL - minL;

  if (toneId <= 2) {
    if (contrast >= 0.2 && contrast <= 0.5) return 9;
    if (contrast < 0.2) return 7;
    return 6;
  }

  if (toneId <= 4) {
    if (contrast >= 0.3 && contrast <= 0.6) return 9;
    return 7;
  }

  if (contrast >= 0.5) return 10;
  if (contrast >= 0.3) return 7;
  return 5;
}

export function scorePatternMix(items: ClothingItem[] | any[]): number {
  const patterns = items.map((item) => (item?.pattern ?? '').toString().toLowerCase());
  const boldPatterns = patterns.filter((p) => ['stripes', 'checks', 'floral', 'print'].includes(p));
  if (boldPatterns.length === 0) return 9;
  if (boldPatterns.length === 1) return 8;
  if (boldPatterns.length === 2) return 5;
  return 3;
}

function scoreOccasionFit(items: ClothingItem[] | any[]): number {
  if (!items.length) return 6;
  const styleTypes = items
    .map((item) => (item?.styleType ?? item?.style_type ?? '').toString().toLowerCase())
    .filter(Boolean);
  const formal = styleTypes.filter((x) => ['formal', 'professional', 'classic', 'tailored'].includes(x)).length;
  const casual = styleTypes.filter((x) => ['casual', 'relaxed', 'minimal'].includes(x)).length;

  if (!styleTypes.length) return 7;
  if (formal > 0 && casual > 0) return 7.5;
  return formal > 0 || casual > 0 ? 8 : 6.5;
}

function score60_30_10(items: ClothingItem[] | any[]): number {
  if (items.length <= 1) return 7;
  const hsls = items.map((item) => getItemHsl(item));
  const saturation = hsls.map((x) => x.s / 100);
  const neutrals = saturation.filter((s) => s < 0.20).length;
  const accents = saturation.filter((s) => s > 0.55).length;

  let score = 6;
  if (neutrals >= 1) score += 1.5;
  if (accents <= 1) score += 1.5;
  if (accents > 2) score -= 2;

  return clampScore(score);
}

export function scoreOutfitProfessional(items: ClothingItem[] | any[], toneId: number, undertone: string): OutfitScore {
  const season = getSeasonalPalette(toneId, undertone);
  void SEASONAL_RULES[season];

  const scores = {
    colorHarmony: scoreColorHarmony(items),
    skinCompatibility: scoreSkinCompatibility(items, toneId, undertone),
    contrastBalance: scoreContrastBalance(items, toneId),
    patternMix: scorePatternMix(items),
    occasionFit: scoreOccasionFit(items),
    sixtythirtyten: score60_30_10(items),
  };

  const weights = {
    colorHarmony: 0.25,
    skinCompatibility: 0.30,
    contrastBalance: 0.15,
    patternMix: 0.10,
    occasionFit: 0.10,
    sixtythirtyten: 0.10,
  };

  const total = Object.entries(scores).reduce(
    (sum, [key, val]) => sum + val * weights[key as keyof typeof weights],
    0
  );

  return { ...scores, total: Math.round(total * 10) / 10 };
}

export function scoreOutfitForSkinTone(outfit: OutfitCandidate | any, toneId: number, undertone: 'Warm' | 'Cool' | 'Neutral'): number {
  return scoreSkinCompatibility(candidateToItems(outfit), toneId, undertone);
}

export function scoreContrastLevel(outfit: OutfitCandidate | any, toneId: number): number {
  return scoreContrastBalance(candidateToItems(outfit), toneId);
}

export function getOutfitColorSummary(items: ClothingItem[]): { dominant: string[]; season: Season } {
  const dominant = items.slice(0, 3).map((item) => getColorName(getItemHex(item)));
  const season = getSeasonalPalette(3, dominant.join(' ').includes('blue') ? 'cool' : 'warm');
  return { dominant, season };
}
