import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { executeSqlWithRetry, getOne } from '../db/queries';
import { FitCheckResult, OutfitCandidate, UserProfile } from '../types/models';
import { md5FileHash } from '../utils/hashUtils';
import { safeAsync } from '../utils/safeAsync';
import { getCached } from './cacheEngine';
import { withFallback, localFitCheck } from './fallbackEngine';
import { managedRequest } from './requestManager';
import { getResetCountdown, readableError } from './validationEngine';
import { getSeasonalPalette } from './colorEngine';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GENERATE_MODEL = 'gemini-2.0-flash';
const PREFERRED_GENERATE_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
] as const;
const DAILY_LIMIT = 60;
const GEMINI_KEY_STORE = 'GEMINI_KEY';
const GEMINI_API_KEY = Constants.expoConfig?.extra?.geminiApiKey ?? '';
const FIT_CHECK_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    skin_tone_match: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        verdict: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['score', 'verdict', 'reason'],
    },
    color_harmony: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        verdict: { type: 'string' },
        reason: { type: 'string' },
        harmony_type: { type: 'string' },
      },
      required: ['score', 'verdict', 'reason', 'harmony_type'],
    },
    proportion: {
      type: 'object',
      properties: {
        score: { type: 'number' },
        verdict: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['score', 'verdict', 'reason'],
    },
    styling_tips: { type: 'array', items: { type: 'string' } },
    color_tips: { type: 'array', items: { type: 'string' } },
    swap_suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item_type: { type: 'string' },
          current_issue: { type: 'string' },
          suggested_color: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['item_type', 'current_issue', 'suggested_color', 'reason'],
      },
    },
    what_works: { type: 'array', items: { type: 'string' } },
    confidence_tip: { type: 'string' },
    style_score: { type: 'number' },
    one_line_verdict: { type: 'string' },
  },
  required: [
    'skin_tone_match',
    'color_harmony',
    'proportion',
    'styling_tips',
    'color_tips',
    'swap_suggestions',
    'what_works',
    'confidence_tip',
    'style_score',
    'one_line_verdict',
  ],
};

interface GeminiCallOptions {
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: object;
}

interface GeminiListModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

let cachedGenerateModel: string | null = null;

function isHardQuotaExceeded(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('quota exceeded')
    || lower.includes('limit: 0')
    || lower.includes('generate_content_free_tier_requests')
    || lower.includes('generate_content_free_tier_input_token_count');
}

function normalizeGeminiKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/^['\"]+|['\"]+$/g, '').replace(/\s+/g, '');
  if (!cleaned || cleaned.toLowerCase() === 'paste_your_key_here_no_quotes') {
    return '';
  }
  return cleaned;
}

function normalizeModelName(name: string): string {
  return name.replace(/^models\//, '').trim();
}

function supportsGenerateContent(model: GeminiListModel): boolean {
  const methods = model.supportedGenerationMethods ?? [];
  return methods.includes('generateContent');
}

function pickGenerateModel(models: GeminiListModel[]): string | null {
  const supportedNames = models
    .filter(supportsGenerateContent)
    .map((model) => normalizeModelName(model.name ?? ''))
    .filter(Boolean);

  if (!supportedNames.length) return null;

  for (const preferred of PREFERRED_GENERATE_MODELS) {
    if (supportedNames.includes(preferred)) {
      return preferred;
    }
  }

  const flashCandidate = supportedNames.find((name) => name.includes('flash'));
  if (flashCandidate) return flashCandidate;

  return supportedNames[0];
}

function buildGenerateUrl(model: string, key: string): string {
  return `${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`;
}

function isUnsupportedModelError(message: string, status: number): boolean {
  const lower = message.toLowerCase();
  return status === 404
    || lower.includes('not found for api version')
    || lower.includes('not supported for generatecontent')
    || lower.includes('model') && lower.includes('not found');
}

async function resolveGenerateModel(key: string): Promise<string> {
  if (cachedGenerateModel) {
    return cachedGenerateModel;
  }

  const { data: res } = await safeAsync(
    async () => fetch(`${GEMINI_API_BASE}/models?key=${key}`),
    'Gemini.listModels'
  );

  if (!res?.ok) {
    cachedGenerateModel = DEFAULT_GENERATE_MODEL;
    return cachedGenerateModel;
  }

  const payload = await res.json() as { models?: GeminiListModel[] };
  const picked = pickGenerateModel(payload.models ?? []);
  cachedGenerateModel = picked ?? DEFAULT_GENERATE_MODEL;
  return cachedGenerateModel;
}

function dateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getRemainingCalls(): Promise<{ remaining: number; resetIn: string }> {
  const today = dateKey();
  const row = await getOne<{ gemini_calls: number }>('SELECT gemini_calls FROM api_usage WHERE date = ?;', [today]);
  const used = row?.gemini_calls ?? 0;
  return { remaining: Math.max(0, DAILY_LIMIT - used), resetIn: getResetCountdown(today) };
}

export async function getGeminiUsageStatus(): Promise<{ remaining: number; resetIn: string }> {
  return getRemainingCalls();
}

export async function getGeminiKey(): Promise<string | null> {
  const secure = normalizeGeminiKey(await SecureStore.getItemAsync(GEMINI_KEY_STORE));
  if (secure) return secure;

  const configKey = normalizeGeminiKey(typeof GEMINI_API_KEY === 'string' ? GEMINI_API_KEY : '');
  if (configKey) {
    return configKey;
  }

  return null;
}

export async function setGeminiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(GEMINI_KEY_STORE, normalizeGeminiKey(key));
  cachedGenerateModel = null;
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(10, value));
}

export function extractJSON(rawText: string): object | null {
  const clean = rawText.replace(/```json|```/g, '').trim();
  const direct = safeJsonParse(clean);
  if (direct) return direct;

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
  if (!Array.isArray(obj.what_works) || obj.what_works.length < 1) return false;
  if (typeof obj.confidence_tip !== 'string') return false;
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

function isLikelyPartialFitCheck(parsed: unknown): boolean {
  if (typeof parsed !== 'object' || parsed === null) return true;
  const obj = parsed as Record<string, unknown>;

  const sections = [obj.skin_tone_match, obj.color_harmony, obj.proportion]
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);

  if (sections.length < 3) return true;

  const hasGenericVerdict = sections.some((section) => {
    const verdict = typeof section.verdict === 'string' ? section.verdict.trim().toLowerCase() : '';
    return !verdict || verdict === 'unknown' || verdict === 'needs review';
  });

  const hasFallbackReason = sections.some((section) => {
    const reason = typeof section.reason === 'string' ? section.reason.trim().toLowerCase() : '';
    return reason.includes('partial ai response received') || reason.includes('incomplete') || !reason;
  });

  const oneLine = typeof obj.one_line_verdict === 'string' ? obj.one_line_verdict.trim().toLowerCase() : '';
  const oneLineLooksPartial = oneLine.includes('partial') || oneLine.includes('incomplete');

  return hasGenericVerdict || hasFallbackReason || oneLineLooksPartial;
}

function buildPartialFitCheck(parsed: unknown): FitCheckResult {
  const obj = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  const skin = (obj.skin_tone_match as Record<string, unknown> | undefined) ?? {};
  const harmony = (obj.color_harmony as Record<string, unknown> | undefined) ?? {};
  const proportion = (obj.proportion as Record<string, unknown> | undefined) ?? {};

  return {
    skin_tone_match: {
      score: clampScore(typeof skin.score === 'number' ? skin.score : 5),
      verdict: typeof skin.verdict === 'string' ? skin.verdict : 'Needs Review',
      reason: typeof skin.reason === 'string' ? skin.reason : 'AI response was incomplete. Please retry for more detail.',
    },
    color_harmony: {
      score: clampScore(typeof harmony.score === 'number' ? harmony.score : 5),
      verdict: typeof harmony.verdict === 'string' ? harmony.verdict : 'Needs Review',
      reason: typeof harmony.reason === 'string' ? harmony.reason : 'AI response was incomplete. Please retry for more detail.',
      harmony_type: typeof harmony.harmony_type === 'string' ? harmony.harmony_type : 'Balanced',
    },
    proportion: {
      score: clampScore(typeof proportion.score === 'number' ? proportion.score : 5),
      verdict: typeof proportion.verdict === 'string' ? proportion.verdict : 'Needs Review',
      reason: typeof proportion.reason === 'string' ? proportion.reason : 'AI response was incomplete. Please retry for more detail.',
    },
    styling_tips: Array.isArray(obj.styling_tips) && obj.styling_tips.length ? obj.styling_tips.filter((x): x is string => typeof x === 'string') : ['Try one balancing layer to improve proportions.'],
    color_tips: Array.isArray(obj.color_tips) && obj.color_tips.length ? obj.color_tips.filter((x): x is string => typeof x === 'string') : ['Use one undertone-friendly color near your face.'],
    swap_suggestions: Array.isArray(obj.swap_suggestions)
      ? obj.swap_suggestions
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          item_type: typeof x.item_type === 'string' ? x.item_type : 'item',
          current_issue: typeof x.current_issue === 'string' ? x.current_issue : 'Current piece weakens the color balance.',
          suggested_color: typeof x.suggested_color === 'string' ? x.suggested_color : 'neutral',
          reason: typeof x.reason === 'string' ? x.reason : 'Swap for better balance.',
          color: typeof x.suggested_color === 'string' ? x.suggested_color : 'neutral',
        }))
      : [],
    what_works: Array.isArray(obj.what_works) && obj.what_works.length
      ? obj.what_works.filter((x): x is string => typeof x === 'string')
      : ['Your outfit direction already has a cohesive foundation.'],
    confidence_tip: typeof obj.confidence_tip === 'string'
      ? obj.confidence_tip
      : 'Lead with one strong focal piece and clean posture for maximum impact.',
    style_score: clampScore(typeof obj.style_score === 'number' ? obj.style_score : 5),
    one_line_verdict: typeof obj.one_line_verdict === 'string' ? obj.one_line_verdict : 'Analysis was incomplete. Try once more for a full report.',
  };
}

async function incrementCallCount(): Promise<void> {
  const today = dateKey();
  await executeSqlWithRetry('INSERT OR IGNORE INTO api_usage (date, gemini_calls) VALUES (?, 0);', [today]);
  await executeSqlWithRetry('UPDATE api_usage SET gemini_calls = gemini_calls + 1 WHERE date = ?;', [today]);
}

async function markQuotaExhausted(): Promise<void> {
  const today = dateKey();
  await executeSqlWithRetry('INSERT OR IGNORE INTO api_usage (date, gemini_calls) VALUES (?, 0);', [today]);
  await executeSqlWithRetry('UPDATE api_usage SET gemini_calls = ? WHERE date = ?;', [DAILY_LIMIT, today]);
}

async function computeMD5(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, value);
}

async function callGemini(prompt: string, imageBase64?: string, options?: GeminiCallOptions): Promise<{ text: string; status: number }> {
  const key = await getGeminiKey();
  if (!key || key === '') {
    throw new Error('Gemini API key not configured');
  }

  const body: {
    contents: Array<{ parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> }>;
    generationConfig?: { response_mime_type?: string; response_schema?: object };
  } = {
    contents: [
      {
        parts: [
          { text: prompt },
          ...(imageBase64 ? [{ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] : []),
        ],
      },
    ],
  };

  if (options?.responseMimeType || options?.responseSchema) {
    body.generationConfig = {
      ...(options?.responseMimeType ? { response_mime_type: options.responseMimeType } : {}),
      ...(options?.responseSchema ? { response_schema: options.responseSchema } : {}),
    };
  }


  for (let modelAttempt = 1; modelAttempt <= 2; modelAttempt += 1) {
    const model = await resolveGenerateModel(key);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 12000);

    const fetchOnce = async (): Promise<Response> => fetch(buildGenerateUrl(model, key), {
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

    const json = await res.json() as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    if (!res.ok) {
      const message = json.error?.message ?? `Gemini request failed (${res.status}).`;
      if (isHardQuotaExceeded(message)) {
        await safeAsync(async () => markQuotaExhausted(), 'Gemini.markQuotaExhausted');
        throw new Error('Gemini quota exceeded. limit:0');
      }
      if (isUnsupportedModelError(message, res.status) && modelAttempt === 1) {
        cachedGenerateModel = null;
        continue;
      }
      throw new Error(message);
    }

    const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n').trim() ?? '';
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    return { text, status: res.status };
  }

  throw new Error('No supported Gemini model is available for generateContent.');
}

async function repairFitCheckJson(rawText: string): Promise<unknown> {
  const repairPrompt = `Convert this outfit analysis output into valid JSON that exactly matches the required schema.
Return JSON only, with no markdown and no extra text.
Output to convert:\n${rawText.slice(0, 7000)}`;

  const { data: response } = await safeAsync(
    async () => callGemini(repairPrompt, undefined, {
      responseMimeType: 'application/json',
      responseSchema: FIT_CHECK_RESPONSE_SCHEMA,
    }),
    'Gemini.fitCheckRepair'
  );

  if (!response) return null;
  return extractJSON(response.text) ?? safeJsonParse(response.text);
}

export async function prepareImageForGemini(imageUri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(imageUri) as { size?: number };
  const sizeKB = (info.size || 0) / 1024;
  const quality = sizeKB > 4000 ? 0.4
    : sizeKB > 2000 ? 0.5
      : sizeKB > 1000 ? 0.6
        : sizeKB > 500 ? 0.7 : 0.8;

  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 768 } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  await safeAsync(
    async () => FileSystem.deleteAsync(result.uri, { idempotent: true }),
    'Gemini.cleanupPreparedImage'
  );

  return result.base64 || '';
}

const buildFitCheckPrompt = (toneName: string, undertone: string,
  season: string, styleIdentity: string): string => `
You are a world-class fashion stylist with 20 years experience
dressing celebrities and executives. You have deep expertise in
color theory, body proportion, and personal styling.

The person wearing this outfit has:
- Skin tone: ${toneName} with ${undertone} undertone
- Seasonal palette: ${season}
- Style identity: ${styleIdentity}

Analyze this outfit with the precision of a professional stylist.
Be honest and specific - not generic. Reference actual visible
details in the photo.

Respond ONLY with this exact JSON structure, no markdown:
{
  "skin_tone_match": {
    "score": <number 1-10>,
    "verdict": "<one of: Exceptional|Flattering|Neutral|Unflattering>",
    "reason": "<specific reason referencing the actual colors worn>"
  },
  "color_harmony": {
    "score": <number 1-10>,
    "verdict": "<one of: Exceptional|High Balance|Balanced|Needs Work>",
    "reason": "<name the specific colors and their relationship>",
    "harmony_type": "<Complementary|Analogous|Monochromatic|Triadic|Discordant>"
  },
  "proportion": {
    "score": <number 1-10>,
    "verdict": "<one of: Excellent|Balanced|Slightly Off|Needs Adjustment>",
    "reason": "<specific observation about the actual fit and silhouette>"
  },
  "styling_tips": [
    "<specific actionable tip 1 - reference actual items worn>",
    "<specific actionable tip 2>",
    "<specific actionable tip 3>"
  ],
  "color_tips": [
    "<tip specific to ${undertone} undertone and these colors>",
    "<second color tip>"
  ],
  "swap_suggestions": [
    {
      "item_type": "<category of item to swap>",
      "current_issue": "<what is wrong with current item>",
      "suggested_color": "<specific color name>",
      "reason": "<why this swap improves the look>"
    }
  ],
  "what_works": [
    "<specific thing that works well in this outfit>",
    "<second thing that works well>"
  ],
  "style_score": <number 1-10>,
  "confidence_tip": "<one sentence specific to the occasion/setting>",
  "one_line_verdict": "<punchy honest one-liner about this outfit>"
}`;

async function callGeminiAPI(imageBase64: string, skinToneId: number, undertone: string): Promise<FitCheckResult> {
  const online = await NetInfo.fetch();
  if (!online.isConnected) {
    throw new Error('No internet connection. Fit Check requires network access.');
  }

  const toneName = `Tone ${skinToneId}`;
  const season = getSeasonalPalette(skinToneId, undertone);
  const styleIdentity = 'classic';
  const prompt = buildFitCheckPrompt(toneName, undertone, season, styleIdentity);

  let parsed: unknown = null;
  let lastRawText = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data: response, error } = await safeAsync(
      async () => callGemini(prompt, imageBase64, {
        responseMimeType: 'application/json',
        responseSchema: FIT_CHECK_RESPONSE_SCHEMA,
      }),
      `Gemini.fitCheckAttempt${attempt}`
    );

    if (error || !response) {
      const raw = String(error ?? '');
      if (isHardQuotaExceeded(raw)) {
        await safeAsync(async () => markQuotaExhausted(), 'Gemini.markQuotaExhaustedErrorPath');
        throw new Error('Gemini quota exceeded. limit:0');
      }
      if (attempt === 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw new Error(readableError(error ?? 'Network error'));
    }

    lastRawText = response.text;
    parsed = extractJSON(response.text);
    if (validateFitCheckResponse(parsed)) {
      await incrementCallCount();
      return parsed as FitCheckResult;
    }

    if (attempt === 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      continue;
    }
  }

  if (!validateFitCheckResponse(parsed) && lastRawText) {
    const repaired = await repairFitCheckJson(lastRawText);
    if (validateFitCheckResponse(repaired)) {
      await incrementCallCount();
      return repaired as FitCheckResult;
    }
  }

  throw new Error('Could not generate a full fit report. Please retry with clearer lighting and a full outfit frame.');
}

async function callGeminiAPICompressed(imageBase64: string, skinToneId: number, undertone: string): Promise<FitCheckResult> {
  return callGeminiAPI(imageBase64, skinToneId, undertone);
}

async function requestManagedFitCheck(imageBase64: string, skinToneId: number, undertone: string): Promise<FitCheckResult> {
  const cacheKey = await computeMD5(imageBase64);
  return managedRequest(
    cacheKey,
    () => callGeminiAPI(imageBase64, skinToneId, undertone),
    30 * 60 * 1000,
    7
  );
}

export async function analyzeFitCheck(
  imageUri: string,
  skinToneId: number,
  undertone: string,
  closetItems: any[]
): Promise<any> {
  const base64 = await prepareImageForGemini(imageUri);
  const cacheKey = base64.substring(0, 32);
  const warmHit = await getCached(cacheKey);
  if (warmHit) {
    return warmHit;
  }

  return withFallback(
    () => managedRequest(cacheKey,
      () => requestManagedFitCheck(base64, skinToneId, undertone),
      30 * 60 * 1000, 7),
    () => managedRequest(`${cacheKey}_retry`,
      () => callGeminiAPICompressed(base64, skinToneId, undertone),
      15 * 60 * 1000, 3),
    () => localFitCheck(closetItems, skinToneId, undertone)
  );
}

export async function validateWithGemini(
  topCandidates: OutfitCandidate[],
  toneName: string,
  undertone: string,
  styleIdentity: string,
  colorPreference: string,
  patternDescription: string
): Promise<Array<{ index: number; score: number; reason: string }>> {
  const key = await getGeminiKey();
  if (!key || key === '') {
    throw new Error('Gemini API key not configured');
  }

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
  const key = await getGeminiKey();
  if (!key || key === '') {
    throw new Error('Gemini API key not configured');
  }

  const online = await NetInfo.fetch();
  if (!online.isConnected) {
    throw new Error('No internet. Fit Check is unavailable offline.');
  }

  const hash = await md5FileHash(imageUri);
  const cached = await getOne<{ gemini_result: string }>('SELECT gemini_result FROM fit_checks WHERE image_hash = ?;', [hash]);

  if (cached) {
    const parsed = extractJSON(cached.gemini_result);
    if (validateFitCheckResponse(parsed) && !isLikelyPartialFitCheck(parsed)) {
      const remain = await getRemainingCalls();
      return { result: parsed as FitCheckResult, remaining: remain.remaining };
    }

    await executeSqlWithRetry('DELETE FROM fit_checks WHERE image_hash = ?;', [hash]);
  }

  const remain = await getRemainingCalls();
  if (remain.remaining <= 0) {
    throw new Error(`Daily limit reached. Resets in ${remain.resetIn}.`);
  }

  const parsed = await analyzeFitCheck(imageUri, user.skinToneId, user.skinUndertone, []);

  if (!validateFitCheckResponse(parsed) || isLikelyPartialFitCheck(parsed)) {
    throw new Error('Could not generate a full fit report. Please retry with clearer lighting and a full outfit frame.');
  }

  const finalResult: FitCheckResult = parsed as FitCheckResult;

  await executeSqlWithRetry(
    'INSERT INTO fit_checks (id, image_path, image_hash, gemini_result, style_score, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'));',
    [`fit-${Date.now()}`, imageUri, hash, JSON.stringify(finalResult), finalResult.style_score]
  );

  const latestRemain = await getRemainingCalls();
  return { result: finalResult, remaining: latestRemain.remaining };
}

export async function validateGeminiKey(): Promise<boolean> {
  const key = await getGeminiKey();
  if (!key || key === '') {
    throw new Error('Gemini API key not configured');
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 12000);

  const { data: res, error } = await safeAsync(
    async () => fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: controller.signal }),
    'Gemini.fetchKeyValidation'
  );

  clearTimeout(timeoutHandle);
  if (error || !res) return false;

  if (res.ok) return true;
  if (res.status === 400 || res.status === 401 || res.status === 403) return false;
  return false;
}

// ─── Production-Grade Prompt Exports (PRD Message 5) ──────────────────────

export const OUTFIT_PROMPT = (
  occasion: string,
  skinTone: string,
  undertone: string,
  styleIdentity: string,
  learnedColors: string,
  items: string
): string => `
You are a world-class personal stylist AI.
Analyze these outfit combinations and rank them.

USER PROFILE:
- Occasion: ${occasion}
- Skin tone: ${skinTone} with ${undertone} undertone
- Style identity: ${styleIdentity}
- Preferred colors: ${learnedColors}

OUTFIT COMBINATIONS TO RATE:
${items}

RULES:
- Rate each outfit 1-10 based on:
  color harmony (30%), skin tone match (40%), occasion fit (30%)
- NEVER score below 4 — we only send valid combinations
- Be specific — reference actual colors and items
- Always output exactly one rating per outfit

Output ONLY valid JSON:
{
  "ratings": [
    {
      "index": 0,
      "score": <4-10>,
      "reason": "<specific 1-sentence reason>",
      "tip": "<one specific improvement>"
    }
  ]
}`;

export const ADVISOR_PROMPT = (
  userMessage: string,
  toneName: string,
  undertone: string,
  styleIdentity: string,
  closetSummary: string
): string => `
You are an expert personal stylist AI.
The user said: "${userMessage}"
Their wardrobe: ${closetSummary}
Skin tone: ${toneName} with ${undertone} undertone
Style: ${styleIdentity}

Determine the best outfit from their wardrobe for this situation.

RULES:
- ALWAYS select an outfit — never say you cannot help
- Be specific about why each item works
- Reference the actual occasion context
- Output ONLY valid JSON, no markdown:

{
  "event_type": "<specific event>",
  "formality": <1-10>,
  "occasion_category": "<casual|formal|party|ethnic|professional>",
  "upper_body_only": <boolean>,
  "confidence_tip": "<specific tip for THIS situation>",
  "explanation": [
    "<specific reason 1 referencing actual items>",
    "<specific reason 2>",
    "<specific reason 3>"
  ],
  "missing_items": ["<item that would help if not in closet>"],
  "styling_notes": "<2 sentence expert note>"
}`;

export const FITCHECK_PROMPT = (
  toneName: string,
  undertone: string,
  styleIdentity: string
): string => `
You are a world-class fashion stylist analyzing an outfit photo.

User profile:
- Skin tone: ${toneName} with ${undertone} undertone
- Style: ${styleIdentity}

Analyze this outfit honestly and specifically.
Reference actual colors and items you can see.
Output ONLY valid JSON, no markdown:

{
  "skin_tone_match": {
    "score": <1-10>,
    "verdict": "<Exceptional|Flattering|Neutral|Unflattering>",
    "reason": "<specific reason referencing actual colors worn>"
  },
  "color_harmony": {
    "score": <1-10>,
    "verdict": "<Exceptional|Balanced|Needs Work>",
    "reason": "<name specific colors and their relationship>"
  },
  "proportion": {
    "score": <1-10>,
    "verdict": "<Excellent|Balanced|Needs Adjustment>",
    "reason": "<specific observation about actual fit>"
  },
  "what_works": [
    "<specific positive observation>",
    "<second positive>"
  ],
  "styling_tips": [
    "<specific actionable tip 1>",
    "<specific actionable tip 2>",
    "<specific actionable tip 3>"
  ],
  "color_tips": [
    "<tip specific to ${undertone} undertone>",
    "<second color tip>"
  ],
  "swap_suggestions": [{
    "item_type": "<item category>",
    "current_issue": "<what is wrong>",
    "suggested_color": "<specific color>",
    "reason": "<why this helps>"
  }],
  "style_score": <1-10>,
  "confidence_tip": "<situation-specific tip>",
  "one_line_verdict": "<honest punchy one-liner>"
}`;

export function validateGeminiResponse(raw: string): object | null {
  try {
    const clean = raw
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    const json = clean.substring(first, last + 1);
    return JSON.parse(json) as object;
  } catch {
    return null;
  }
}
