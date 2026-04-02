import { SKIN_TONES, getSkinToneColorTable } from '../constants/skinTones';
import { SkinToneColors, SkinToneResult, Undertone } from '../types/models';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { safeAsync } from '../utils/safeAsync';

type RgbTuple = [number, number, number];

interface MonkTone {
  id: number;
  name: string;
  hex: string;
  undertone: 'warm' | 'cool' | 'neutral';
}

interface DetectionFailedResult {
  detected: false;
  toooDark: boolean;
}

interface DetectionSuccessResult extends SkinToneResult {
  detected: true;
  toooDark: false;
  confidence: number;
}

export type DetectSkinToneResult = DetectionSuccessResult | DetectionFailedResult;

const MONK_SCALE: MonkTone[] = [
  { id: 1, name: 'Very Fair', hex: '#F6EDE4', undertone: 'cool' },
  { id: 2, name: 'Fair', hex: '#F3E7DB', undertone: 'neutral' },
  { id: 3, name: 'Medium Light', hex: '#D4AA87', undertone: 'warm' },
  { id: 4, name: 'Medium', hex: '#C08B5C', undertone: 'warm' },
  { id: 5, name: 'Medium Dark', hex: '#8D5524', undertone: 'warm' },
  { id: 6, name: 'Deep', hex: '#4A2912', undertone: 'neutral' },
];

function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

function rgbToHslNormalized(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }

  return [(h + 360) % 360, s, l];
}

function decodeBase64Pixels(base64: string): RgbTuple[] {
  const bytes = atob(base64);
  const pixels: RgbTuple[] = [];
  const max = Math.floor(bytes.length / 4);
  for (let i = 0; i < max; i += 1) {
    const idx = i * 4;
    const r = bytes.charCodeAt(idx) % 256;
    const g = bytes.charCodeAt(idx + 1) % 256;
    const b = bytes.charCodeAt(idx + 2) % 256;
    pixels.push([r, g, b]);
  }
  return pixels;
}

function hexToRgb(hex: string): RgbTuple {
  const cleaned = hex.replace('#', '');
  const num = Number.parseInt(cleaned, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function averagePixels(pixels: RgbTuple[]): RgbTuple {
  if (!pixels.length) return [0, 0, 0];
  const sum = pixels.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b] as RgbTuple,
    [0, 0, 0] as RgbTuple
  );
  return [
    Math.round(sum[0] / pixels.length),
    Math.round(sum[1] / pixels.length),
    Math.round(sum[2] / pixels.length),
  ];
}

function detectSkinPixels(pixels: RgbTuple[]): RgbTuple[] {
  return pixels.filter(([r, g, b]) => {
    const [h, s, l] = rgbToHslNormalized(r, g, b);
    return (
      h >= 0 && h <= 50
      && s >= 0.08 && s <= 0.65
      && l >= 0.20 && l <= 0.85
      && r > g && r > b
      && r - b > 15
      && Math.abs(r - g) < 50
    );
  });
}

function classifyToneByDeltaE(avgRgb: RgbTuple): MonkTone {
  let closest = MONK_SCALE[0];
  let minDistance = Number.POSITIVE_INFINITY;

  MONK_SCALE.forEach((tone) => {
    const toneRgb = hexToRgb(tone.hex);
    const distance = Math.sqrt(
      ((avgRgb[0] - toneRgb[0]) ** 2) * 0.30
      + ((avgRgb[1] - toneRgb[1]) ** 2) * 0.59
      + ((avgRgb[2] - toneRgb[2]) ** 2) * 0.11
    );
    if (distance < minDistance) {
      minDistance = distance;
      closest = tone;
    }
  });

  return closest;
}

function detectUndertone(skinPixels: RgbTuple[]): 'warm' | 'cool' | 'neutral' {
  const avg = averagePixels(skinPixels);
  const [h] = rgbToHslNormalized(avg[0], avg[1], avg[2]);
  const yellowRed = avg[0] + avg[1] - avg[2];
  const bluePink = avg[2] - avg[1];

  if (yellowRed > 80 && h < 25) return 'warm';
  if (bluePink > 10 || h > 30) return 'cool';
  return 'neutral';
}

function calculateConfidence(skinPixels: RgbTuple[], totalPixels: number): number {
  if (totalPixels <= 0) return 0.40;
  const ratio = skinPixels.length / totalPixels;
  if (ratio < 0.15) return 0.40;
  if (ratio < 0.25) return 0.65;
  if (ratio < 0.40) return 0.80;
  return 0.95;
}

function mapUndertone(value: 'warm' | 'cool' | 'neutral'): Undertone {
  if (value === 'warm') return 'Warm';
  if (value === 'cool') return 'Cool';
  return 'Neutral';
}

async function isolateFaceRegion(imageUri: string): Promise<{ uri: string; base64: string }> {
  const { width, height } = await getImageDimensions(imageUri);
  const crop = await ImageManipulator.manipulateAsync(
    imageUri,
    [{
      crop: {
        originX: width * 0.25,
        originY: height * 0.05,
        width: width * 0.50,
        height: height * 0.45,
      },
    }, { resize: { width: 140, height: 140 } }],
    { format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  return { uri: crop.uri, base64: crop.base64 ?? '' };
}

function buildPreviewHex(avgRgb: RgbTuple): string {
  return `#${avgRgb.map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')}`;
}

export async function detectSkinTone(imageUri: string): Promise<DetectSkinToneResult> {
  const isolated = await isolateFaceRegion(imageUri);

  if (!isolated.base64) {
    await safeAsync(async () => FileSystem.deleteAsync(isolated.uri, { idempotent: true }), 'SkinTone.cleanupNoBase64');
    return { detected: false, toooDark: false };
  }

  const allPixels = decodeBase64Pixels(isolated.base64);
  if (!allPixels.length) {
    await safeAsync(async () => FileSystem.deleteAsync(isolated.uri, { idempotent: true }), 'SkinTone.cleanupNoPixels');
    return { detected: false, toooDark: false };
  }

  const allAvg = averagePixels(allPixels);
  const [, , allLightness] = rgbToHslNormalized(allAvg[0], allAvg[1], allAvg[2]);
  if (allLightness < 0.20) {
    await safeAsync(async () => FileSystem.deleteAsync(isolated.uri, { idempotent: true }), 'SkinTone.cleanupTooDark');
    return { detected: false, toooDark: true };
  }

  const skinPixels = detectSkinPixels(allPixels);
  const confidence = calculateConfidence(skinPixels, allPixels.length);

  if (!skinPixels.length || confidence < 0.65) {
    await safeAsync(async () => FileSystem.deleteAsync(isolated.uri, { idempotent: true }), 'SkinTone.cleanupLowConfidence');
    return { detected: false, toooDark: false };
  }

  const avgSkin = averagePixels(skinPixels);
  const tone = classifyToneByDeltaE(avgSkin);
  const undertone = mapUndertone(detectUndertone(skinPixels));
  const previewHex = buildPreviewHex(avgSkin);

  const output: DetectSkinToneResult = {
    detected: true,
    toooDark: false,
    toneId: tone.id,
    toneName: tone.name,
    undertone,
    hexPreview: previewHex,
    confidence,
  };

  await safeAsync(async () => FileSystem.deleteAsync(isolated.uri, { idempotent: true }), 'SkinTone.cleanupSuccess');
  return output;
}

export function getSkinToneColors(toneId: number, undertone: Undertone): SkinToneColors {
  const validToneId = SKIN_TONES.find((t) => t.id === toneId)?.id ?? 3;
  return getSkinToneColorTable(validToneId, undertone);
}
