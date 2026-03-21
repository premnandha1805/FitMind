import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { safeAsync } from './safeAsync';
import { rgbToHsl } from './colorUtils';

export interface PixelSample {
  h: number;
  s: number;
  l: number;
}

export async function samplePixelsFromCenter(uri: string, count: number): Promise<PixelSample[]> {
  const { data: manipulated, error } = await safeAsync(
    async () => ImageManipulator.manipulateAsync(uri, [{ resize: { width: 40, height: 40 } }], { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true }),
    'Pixel.sampleCenter'
  );

  if (error || !manipulated?.base64) {
    throw new Error('Could not sample image pixels.');
  }

  const bytes = atob(manipulated.base64);
  const samples: PixelSample[] = [];
  const max = Math.min(count, Math.floor(bytes.length / 4));
  for (let i = 0; i < max; i += 1) {
    const idx = i * 4;
    const r = bytes.charCodeAt(idx) % 256;
    const g = bytes.charCodeAt(idx + 1) % 256;
    const b = bytes.charCodeAt(idx + 2) % 256;
    samples.push(rgbToHsl(r, g, b));
  }

  await safeAsync(async () => FileSystem.deleteAsync(manipulated.uri, { idempotent: true }), 'Pixel.cleanupSampleTemp');
  return samples;
}
