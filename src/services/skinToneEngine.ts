import { SKIN_TONES, getSkinToneColorTable } from '../constants/skinTones';
import { SkinToneColors, SkinToneResult, Undertone } from '../types/models';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { safeAsync } from '../utils/safeAsync';

interface HslRgbPixel {
  h: number;
  s: number;
  l: number;
  r: number;
  g: number;
  b: number;
}

interface DetectionFailedResult {
  detected: false;
  toooDark: boolean;
}

interface DetectionSuccessResult extends SkinToneResult {
  detected: true;
  toooDark: false;
}

export type DetectSkinToneResult = DetectionSuccessResult | DetectionFailedResult;

function mapTone(lightness: number): { id: number; name: string } {
  if (lightness > 75) return { id: 1, name: 'Very Fair' };
  if (lightness >= 65) return { id: 2, name: 'Fair' };
  if (lightness >= 55) return { id: 3, name: 'Medium Light' };
  if (lightness >= 45) return { id: 4, name: 'Medium' };
  if (lightness >= 35) return { id: 5, name: 'Medium Dark' };
  return { id: 6, name: 'Deep' };
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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

  return {
    h: (h + 360) % 360,
    s: s * 100,
    l: l * 100,
  };
}

function decodeBase64Pixels(base64: string): HslRgbPixel[] {
  const bytes = atob(base64);
  const pixels: HslRgbPixel[] = [];
  const max = Math.floor(bytes.length / 4);
  for (let i = 0; i < max; i += 1) {
    const idx = i * 4;
    const r = bytes.charCodeAt(idx) % 256;
    const g = bytes.charCodeAt(idx + 1) % 256;
    const b = bytes.charCodeAt(idx + 2) % 256;
    const hsl = rgbToHsl(r, g, b);
    pixels.push({ ...hsl, r, g, b });
  }
  return pixels;
}

function pickUndertoneByVote(pixels: HslRgbPixel[]): Undertone {
  const warmScore = pixels.filter((p) => p.h < 20).length;
  const neutralScore = pixels.filter((p) => p.h >= 20 && p.h <= 25).length;
  const coolScore = pixels.filter((p) => p.h > 25).length;

  if (warmScore >= neutralScore && warmScore >= coolScore) return 'Warm';
  if (coolScore >= neutralScore && coolScore >= warmScore) return 'Cool';
  return 'Neutral';
}

export async function detectSkinTone(imageUri: string): Promise<DetectSkinToneResult> {
  const { width, height } = await getImageSize(imageUri);
  const crop = {
    originX: width * 0.35,
    originY: height * 0.25,
    width: width * 0.30,
    height: height * 0.35,
  };

  const cropped = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ crop }, { resize: { width: 100, height: 100 } }],
    { format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  if (!cropped.base64) {
    await safeAsync(async () => FileSystem.deleteAsync(cropped.uri, { idempotent: true }), 'SkinTone.cleanupNoBase64');
    return { detected: false, toooDark: false };
  }

  const allPixels = decodeBase64Pixels(cropped.base64);
  if (!allPixels.length) {
    await safeAsync(async () => FileSystem.deleteAsync(cropped.uri, { idempotent: true }), 'SkinTone.cleanupNoPixels');
    return { detected: false, toooDark: false };
  }

  const avgAllLightness = allPixels.reduce((sum, p) => sum + p.l, 0) / allPixels.length;
  if (avgAllLightness < 25) {
    await safeAsync(async () => FileSystem.deleteAsync(cropped.uri, { idempotent: true }), 'SkinTone.cleanupTooDark');
    return { detected: false, toooDark: true };
  }

  const filtered = allPixels.filter(
    (p) =>
      p.h >= 0 &&
      p.h <= 40 &&
      p.s >= 10 &&
      p.s <= 60 &&
      p.l >= 20 &&
      p.l <= 80 &&
      p.r > p.g &&
      p.g > p.b
  );

  if (filtered.length < 30) {
    await safeAsync(async () => FileSystem.deleteAsync(cropped.uri, { idempotent: true }), 'SkinTone.cleanupTooFewPixels');
    return { detected: false, toooDark: false };
  }

  const avg = filtered.reduce(
    (acc, p) => ({ h: acc.h + p.h, s: acc.s + p.s, l: acc.l + p.l }),
    { h: 0, s: 0, l: 0 }
  );
  const l = avg.l / filtered.length;
  const tone = mapTone(l);
  const undertone = pickUndertoneByVote(filtered);

  const previewL = Math.round(l);
  const previewHex = `#${Math.max(0, Math.min(255, Math.round((previewL / 100) * 255))).toString(16).padStart(2, '0').repeat(3)}`;

  const output: DetectSkinToneResult = {
    detected: true,
    toooDark: false,
    toneId: tone.id,
    toneName: tone.name,
    undertone,
    hexPreview: previewHex,
  };

  await safeAsync(async () => FileSystem.deleteAsync(cropped.uri, { idempotent: true }), 'SkinTone.cleanupSuccess');
  return output;
}

export function getSkinToneColors(toneId: number, undertone: Undertone): SkinToneColors {
  const validToneId = SKIN_TONES.find((t) => t.id === toneId)?.id ?? 3;
  return getSkinToneColorTable(validToneId, undertone);
}
