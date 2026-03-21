import { COLOR_HEX_MAP } from '../constants/colorPalettes';
import { OutfitCandidate, OutfitComposition } from '../types/models';
import { hexToRgb, hueDiff, rgbToHsl } from '../utils/colorUtils';
import { getSkinToneColors } from './skinToneEngine';

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

export function scoreColorPair(hsl1: { h: number; s: number; l: number }, hsl2: { h: number; s: number; l: number }): number {
  let score = 5;
  if (isComplementary(hsl1, hsl2)) score += 3;
  if (isAnalogous(hsl1, hsl2)) score += 2;
  if (isNeutral(hsl1) || isNeutral(hsl2)) score += 1;
  if (isStatementPiece(hsl1) && isStatementPiece(hsl2) && hueDiff(hsl1.h, hsl2.h) > 60) score -= 3;
  return Math.max(0, Math.min(10, score));
}

export function apply60_30_10Rule(items: OutfitCandidate): OutfitComposition {
  const bottomHsl = parseHSL(items.bottom.colorHsl);
  const topHsl = parseHSL(items.top.colorHsl);
  const accentItem = items.accessory ?? items.shoes;
  const accentHsl = accentItem ? parseHSL(accentItem.colorHsl) : null;

  let ruleScoreAdjustment = 0;

  if (bottomHsl.s > 50) {
    ruleScoreAdjustment -= 2;
  }

  if (accentHsl && isComplementary(topHsl, accentHsl)) {
    ruleScoreAdjustment += 2;
  }

  return {
    dominant: items.bottom,
    secondary: items.top,
    accent: accentItem,
    ruleScoreAdjustment,
  };
}

function colorNameFromHex(hex: string): string {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const entries = Object.entries(COLOR_HEX_MAP);
  let closest = 'neutral';
  let smallest = Number.POSITIVE_INFINITY;
  entries.forEach(([name, value]) => {
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

export function scoreOutfitForSkinTone(outfit: OutfitCandidate, toneId: number, undertone: 'Warm' | 'Cool' | 'Neutral'): number {
  const table = getSkinToneColors(toneId, undertone);
  const names = [outfit.top.colorHex, outfit.bottom.colorHex, outfit.shoes?.colorHex, outfit.accessory?.colorHex]
    .filter((x): x is string => Boolean(x))
    .map((x) => colorNameFromHex(x));

  let score = 0;
  names.forEach((name) => {
    const lowerName = name.toLowerCase();
    if (table.excellentColors.some((x) => lowerName.includes(x.toLowerCase()))) score += 3;
    else if (table.goodColors.some((x) => lowerName.includes(x.toLowerCase()))) score += 1;
    else if (table.avoidColors.some((x) => lowerName.includes(x.toLowerCase()))) score -= 3;
  });
  return Math.max(0, Math.min(10, ((score + 9) / 18) * 10));
}

export function scoreContrastLevel(outfit: OutfitCandidate, toneId: number): number {
  const h1 = parseHSL(outfit.top.colorHsl);
  const h2 = parseHSL(outfit.bottom.colorHsl);
  const contrast = Math.abs(h1.l - h2.l);
  let target = 50;
  if (toneId <= 2) target = 25;
  else if (toneId <= 4) target = 45;
  else target = 65;
  const distance = Math.abs(target - contrast);
  return Math.max(0, Math.min(10, 10 - distance / 10));
}
