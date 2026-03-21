import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { safeAsync } from './safeAsync';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function ensureImageUnder4Mb(uri: string): Promise<string> {
  const { data: info, error: infoError } = await safeAsync(
    async () => FileSystem.getInfoAsync(uri),
    'ensureImageUnder4Mb.info'
  );
  if (infoError || !info?.exists) {
    throw new Error('Image file missing from path.');
  }

  if ((info.size ?? 0) <= MAX_IMAGE_BYTES) {
    return uri;
  }

  const { data: compressed, error } = await safeAsync(
    async () => ImageManipulator.manipulateAsync(uri, [], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }),
    'Image.compressUnder4Mb'
  );

  if (error || !compressed) {
    throw new Error('Image compression failed.');
  }

  return compressed.uri;
}

export async function saveImageToAppDir(uri: string, prefix: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}fitmind/`;
  await safeAsync(async () => FileSystem.makeDirectoryAsync(dir, { intermediates: true }), 'Image.createAppDir');

  const ext = uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const path = `${dir}${prefix}-${Date.now()}.${ext}`;

  const copy = async (): Promise<string> => {
    await FileSystem.copyAsync({ from: uri, to: path });
    return path;
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await safeAsync(copy, `Image.copyToAppDir${attempt}`);
    if (!error && data) {
      if (uri !== data) {
        await safeAsync(async () => FileSystem.deleteAsync(uri, { idempotent: true }), 'Image.cleanupTempFile');
      }
      return data;
    }
    await safeAsync(
      async () => new Promise<void>((resolve) => setTimeout(resolve, 200 * (attempt + 1))),
      'Image.copyBackoff'
    );
  }

  throw new Error('Image save failed after retries.');
}
