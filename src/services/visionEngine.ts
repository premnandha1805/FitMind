import { rgbToHex } from '../utils/colorUtils';
import { samplePixelsFromCenter } from '../utils/pixelUtils';
import { classifyClothingItem } from './classificationEngine';

export interface DetectedClothing {
  category: 'top' | 'bottom' | 'shoes' | 'accessory' | 'outerwear';
  subcategory: string;
  pattern: 'solid' | 'stripes' | 'checks' | 'floral' | 'print' | 'geometric' | 'abstract' | 'other';
  style_type: 'casual' | 'formal' | 'party' | 'ethnic' | 'professional' | 'sports' | 'smart_casual';
  fit_type: 'slim' | 'regular' | 'relaxed' | 'oversized' | 'fitted';
  season: 'summer' | 'winter' | 'spring' | 'autumn' | 'all-season';
  confidence: number;
  ai_raw_label: string;
  source?: 'mlkit' | 'gemini' | 'mlkit_fallback';
}

export async function detectClothing(imageUri: string): Promise<DetectedClothing> {
  return classifyClothingItem(imageUri);
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hn < 60) {
    r1 = c;
    g1 = x;
  } else if (hn < 120) {
    r1 = x;
    g1 = c;
  } else if (hn < 180) {
    g1 = c;
    b1 = x;
  } else if (hn < 240) {
    g1 = x;
    b1 = c;
  } else if (hn < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export async function extractColorFromPixels(imageUri: string): Promise<{ hex: string; hsl: string }> {
  // Production rule: color extraction uses pixel sampling only, never Gemini.
  const samples = await samplePixelsFromCenter(imageUri, 64);
  if (!samples.length) {
    return { hex: '#808080', hsl: 'hsl(0,0,50)' };
  }

  const avg = samples.reduce(
    (acc, sample) => ({ h: acc.h + sample.h, s: acc.s + sample.s, l: acc.l + sample.l }),
    { h: 0, s: 0, l: 0 }
  );

  const h = avg.h / samples.length;
  const s = avg.s / samples.length;
  const l = avg.l / samples.length;
  const rgb = hslToRgb(h, s, l);

  return {
    hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    hsl: `hsl(${h.toFixed(0)},${s.toFixed(0)},${l.toFixed(0)})`,
  };
}
