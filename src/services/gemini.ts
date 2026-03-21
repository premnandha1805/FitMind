import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { executeSqlWithRetry, getOne } from '../db/queries';
import { FitCheckResult, OutfitCandidate, UserProfile } from '../types/models';
import { md5FileHash } from '../utils/hashUtils';
import { safeAsync } from '../utils/safeAsync';
import { getResetCountdown, readableError } from './validationEngine';

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const DAILY_LIMIT = 60;
const GEMINI_KEY_STORE = 'GEMINI_KEY';

function dateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getRemainingCalls(): Promise<{ remaining: number; resetIn: string }> {
  const today = dateKey();
  const row = await getOne<{ gemini_calls: number }>('SELECT gemini_calls FROM api_usage WHERE date = ?;', [today]);
  const used = row?.gemini_calls ?? 0;
  return { remaining: Math.max(0, DAILY_LIMIT - used), resetIn: getResetCountdown(today) };
}

export async function getGeminiKey(): Promise<string | null> {
  const secure = await SecureStore.getItemAsync(GEMINI_KEY_STORE);
  if (secure) return secure;
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? null;
}

export async function setGeminiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(GEMINI_KEY_STORE, key.trim());
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, value));
}

export function extractJSON(rawText: string): object | null {
  const clean = rawText.replace(/```json|```/g, '').trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first < 0 || last < 0 || last <= first) {
    return null;
  }

  const candidate = clean.slice(first, last + 1);
  const firstParse = safeJsonParse(candidate);
  if (firstParse) return firstParse;

  const noTrailingCommas = candidate.replace(/,\s*([}\]])/g, '$1');
  return safeJsonParse(noTrailingCommas);
}

function safeJsonParse(text: string): object | null {
  try {
    const parsed = JSON.parse(text) as object;
    return parsed;
  } catch {
    return null;
  }
}

export function validateFitCheckResponse(parsed: unknown): boolean {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;

  const skin = obj.skin_tone_match as Record<string, unknown> | undefined;
  const harmony = obj.color_harmony as Record<string, unknown> | undefined;
  const proportion = obj.proportion as Record<string, unknown> | undefined;
  if (!skin || !harmony || !proportion) return false;

  if (typeof skin.verdict !== 'string' || typeof skin.reason !== 'string') return false;
  if (typeof harmony.verdict !== 'string' || typeof harmony.reason !== 'string') return false;
  if (typeof proportion.verdict !== 'string' || typeof proportion.reason !== 'string') return false;
  if (!Array.isArray(obj.styling_tips) || obj.styling_tips.length < 1) return false;
  if (!Array.isArray(obj.color_tips) || obj.color_tips.length < 1) return false;
  if (!Array.isArray(obj.swap_suggestions)) return false;
  if (typeof obj.one_line_verdict !== 'string') return false;

  if (typeof skin.score !== 'number' || typeof harmony.score !== 'number' || typeof proportion.score !== 'number' || typeof obj.style_score !== 'number') {
    return false;
  }

  skin.score = clampScore(skin.score);
  harmony.score = clampScore(harmony.score);
  proportion.score = clampScore(proportion.score);
  obj.style_score = clampScore(obj.style_score);
  return true;
}

function buildPartialFitCheck(parsed: unknown): FitCheckResult {
  const obj = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  const skin = (obj.skin_tone_match as Record<string, unknown> | undefined) ?? {};
  const harmony = (obj.color_harmony as Record<string, unknown> | undefined) ?? {};
  const proportion = (obj.proportion as Record<string, unknown> | undefined) ?? {};

  return {
    skin_tone_match: {
      score: clampScore(typeof skin.score === 'number' ? skin.score : 5),
      verdict: typeof skin.verdict === 'string' ? skin.verdict : 'Unknown',
      reason: typeof skin.reason === 'string' ? skin.reason : 'Partial AI response received.',
    },
    color_harmony: {
      score: clampScore(typeof harmony.score === 'number' ? harmony.score : 5),
      verdict: typeof harmony.verdict === 'string' ? harmony.verdict : 'Unknown',
      reason: typeof harmony.reason === 'string' ? harmony.reason : 'Partial AI response received.',
    },
    proportion: {
      score: clampScore(typeof proportion.score === 'number' ? proportion.score : 5),
      verdict: typeof proportion.verdict === 'string' ? proportion.verdict : 'Unknown',
      reason: typeof proportion.reason === 'string' ? proportion.reason : 'Partial AI response received.',
    },
    styling_tips: Array.isArray(obj.styling_tips) && obj.styling_tips.length ? obj.styling_tips.filter((x): x is string => typeof x === 'string') : ['Try one balancing layer to improve proportions.'],
    color_tips: Array.isArray(obj.color_tips) && obj.color_tips.length ? obj.color_tips.filter((x): x is string => typeof x === 'string') : ['Use one undertone-friendly color near your face.'],
    swap_suggestions: Array.isArray(obj.swap_suggestions)
      ? obj.swap_suggestions
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          item_type: typeof x.item_type === 'string' ? x.item_type : 'item',
          reason: typeof x.reason === 'string' ? x.reason : 'Swap for better balance.',
          color: typeof x.color === 'string' ? x.color : 'neutral',
        }))
      : [],
    style_score: clampScore(typeof obj.style_score === 'number' ? obj.style_score : 5),
    one_line_verdict: typeof obj.one_line_verdict === 'string' ? obj.one_line_verdict : 'Partial result generated. Try again for a fuller report.',
  };
}

async function incrementCallCount(): Promise<void> {
  const today = dateKey();
  await executeSqlWithRetry('INSERT OR IGNORE INTO api_usage (date, gemini_calls) VALUES (?, 0);', [today]);
  await executeSqlWithRetry('UPDATE api_usage SET gemini_calls = gemini_calls + 1 WHERE date = ?;', [today]);
}

async function callGemini(prompt: string, imageBase64?: string): Promise<{ text: string; status: number }> {
  const key = await getGeminiKey();
  if (!key) {
    throw new Error('Gemini API key is not configured.');
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 12000);

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          ...(imageBase64 ? [{ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] : []),
        ],
      },
    ],
  };

  const fetchOnce = async (): Promise<Response> => fetch(`${API_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  const { data: res, error } = await safeAsync(fetchOnce, 'Gemini.fetchGenerate');
  clearTimeout(timeoutHandle);

  if (error || !res) {
    if (error?.toLowerCase().includes('abort')) {
      throw new Error('Analysis is taking too long. Tap to try again.');
    }
    throw new Error('Network error while contacting Gemini.');
  }

  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return { text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? '', status: res.status };
}

export async function prepareImageForGemini(imageUri: string): Promise<string> {
  let currentUri = imageUri;
  const tempUris: string[] = [];
  const compressSteps: Array<{ threshold: number; compress: number }> = [
    { threshold: 4 * 1024 * 1024, compress: 0.8 },
    { threshold: 2 * 1024 * 1024, compress: 0.6 },
    { threshold: 1 * 1024 * 1024, compress: 0.5 },
  ];

  for (const step of compressSteps) {
    const info = await FileSystem.getInfoAsync(currentUri);
    const size = 'size' in info && typeof info.size === 'number' ? info.size : 0;
    if (size <= step.threshold) {
      continue;
    }

    const compressed = await ImageManipulator.manipulateAsync(
      currentUri,
      [],
      { compress: step.compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    if (compressed.uri !== imageUri) {
      tempUris.push(compressed.uri);
    }
    currentUri = compressed.uri;
  }

  const base64 = await FileSystem.readAsStringAsync(currentUri, { encoding: FileSystem.EncodingType.Base64 });
  await Promise.all(tempUris.map((uri) => safeAsync(async () => FileSystem.deleteAsync(uri, { idempotent: true }), 'Gemini.cleanupTempImage')));
  return base64;
}

export async function validateWithGemini(
  topCandidates: OutfitCandidate[],
  toneName: string,
  undertone: string,
  styleIdentity: string,
  colorPreference: string,
  patternDescription: string
): Promise<Array<{ index: number; score: number; reason: string }>> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    throw new Error('No internet connection for Gemini validation.');
  }

  const { remaining, resetIn } = await getRemainingCalls();
  if (remaining <= 0) {
    throw new Error(`Daily limit reached. Resets in ${resetIn}.`);
  }

  const candidates = topCandidates.slice(0, 6).map((c, index) => ({
    index,
    colors: [c.top.colorHex, c.bottom.colorHex],
    patterns: [c.top.pattern ?? 'solid', c.bottom.pattern ?? 'solid'],
    description: `${c.top.styleType} top with ${c.bottom.styleType} bottom`,
  }));

  const prompt = `You are an expert fashion stylist specializing in color, skin tone,
and personal style. The user has:
- Skin tone: ${toneName}, undertone: ${undertone}
- Style identity: ${styleIdentity}
- Color preference: ${colorPreference}
- Pattern preference: ${patternDescription}
Rate each candidate from 1-10 and return JSON only:
{ "ratings": [{ "index": 0, "score": 8, "reason": "brief reason" }] }
Candidates: ${JSON.stringify(candidates)}`;

  const response = await callGemini(prompt);
  if (response.status === 429) {
    throw new Error(`Daily limit reached. Resets in ${resetIn}.`);
  }

  const parsed = extractJSON(response.text) as { ratings?: Array<{ index: number; score: number; reason: string }> } | null;
  const rawRatings = parsed?.ratings ?? [];

  const normalized = candidates.map((candidate) => {
    const found = rawRatings.find((rating) => rating.index === candidate.index);
    return {
      index: candidate.index,
      score: clampScore(typeof found?.score === 'number' ? found.score : 6),
      reason: typeof found?.reason === 'string' ? found.reason : 'No AI reason returned for this candidate.',
    };
  });

  await incrementCallCount();
  return normalized;
}

export async function runFitCheck(imageUri: string, user: UserProfile): Promise<{ result: FitCheckResult; remaining: number }> {
  const online = await NetInfo.fetch();
  if (!online.isConnected) {
    throw new Error('No internet. Fit Check is unavailable offline.');
  }

  const hash = await md5FileHash(imageUri);
  const cached = await getOne<{ gemini_result: string }>('SELECT gemini_result FROM fit_checks WHERE image_hash = ?;', [hash]);

  if (cached) {
    const parsed = extractJSON(cached.gemini_result);
    if (validateFitCheckResponse(parsed)) {
      const remain = await getRemainingCalls();
      return { result: parsed as FitCheckResult, remaining: remain.remaining };
    }
  }

  const remain = await getRemainingCalls();
  if (remain.remaining <= 0) {
    throw new Error(`Daily limit reached. Resets in ${remain.resetIn}.`);
  }

  const imageBase64 = await prepareImageForGemini(imageUri);

  const FIT_CHECK_PROMPT = `You are a professional fashion stylist. The user has:
skin tone: ${user.skinToneId}, undertone: ${user.skinUndertone},
style identity: classic.
Analyze this outfit photo carefully.
Consider how the colors work for their specific skin tone.
Respond ONLY with valid JSON, no markdown, no code fences:
{
  "skin_tone_match": { "score": 9, "verdict": "Flattering",
    "reason": "The warm coral complements your medium skin tone" },
  "color_harmony": { "score": 8, "verdict": "Excellent",
    "reason": "Earth tones create a cohesive warm palette" },
  "proportion": { "score": 7, "verdict": "Balanced",
    "reason": "Relaxed top with slim bottom is well balanced" },
  "styling_tips": ["tip1", "tip2", "tip3"],
  "color_tips": ["This warm tone flatters your undertone",
    "The contrast level suits your skin tone perfectly"],
  "swap_suggestions": [{
    "item_type": "belt",
    "reason": "A black belt sharpens the silhouette",
    "color": "black"
  }],
  "style_score": 8,
  "one_line_verdict": "A flattering, well-coordinated look."
}`;

  let parsed: unknown = null;
  let lastRawText = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data: response, error } = await safeAsync(
      async () => callGemini(FIT_CHECK_PROMPT, imageBase64),
      `Gemini.fitCheckAttempt${attempt}`
    );

    if (error || !response) {
      if (attempt === 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw new Error(readableError(error ?? 'Network error'));
    }

    if (response.status === 429) {
      throw new Error(`Daily limit reached. Resets in ${remain.resetIn}.`);
    }

    lastRawText = response.text;
    parsed = extractJSON(response.text);
    if (validateFitCheckResponse(parsed)) {
      break;
    }

    if (attempt === 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      continue;
    }
  }

  const finalResult: FitCheckResult = validateFitCheckResponse(parsed)
    ? (parsed as FitCheckResult)
    : buildPartialFitCheck(extractJSON(lastRawText));

  await executeSqlWithRetry(
    'INSERT INTO fit_checks (id, image_path, image_hash, gemini_result, style_score, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'));',
    [`fit-${Date.now()}`, imageUri, hash, JSON.stringify(finalResult), finalResult.style_score]
  );
  await incrementCallCount();

  const latestRemain = await getRemainingCalls();
  return { result: finalResult, remaining: latestRemain.remaining };
}

export async function validateGeminiKey(): Promise<boolean> {
  const key = await getGeminiKey();
  if (!key) return false;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 12000);

  const body = {
    contents: [{ parts: [{ text: 'Reply with the word OK' }] }],
  };

  const { data: res, error } = await safeAsync(
    async () => fetch(`${API_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }),
    'Gemini.fetchKeyValidation'
  );

  clearTimeout(timeoutHandle);
  if (error || !res) return false;
  if (res.status === 401 || res.status === 403) return false;

  const { data } = await safeAsync(
    async () => res.json() as Promise<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>,
    'Gemini.parseKeyValidation'
  );
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.toLowerCase().includes('ok');
}
