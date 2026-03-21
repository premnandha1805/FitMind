import * as Crypto from 'expo-crypto';
import { safeAsync } from './safeAsync';

export async function md5FileHash(uri: string): Promise<string> {
  const { data, error } = await safeAsync(
    async () => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, uri),
    'Hash.md5File'
  );
  if (error || !data) {
    throw new Error('Unable to hash image for cache check.');
  }
  return data;
}
