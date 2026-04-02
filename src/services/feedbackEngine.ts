import { executeSqlWithRetry, getAll, getOne } from '../db/queries';
import { TasteInsight, TasteProfile } from '../types/models';
import { clamp } from '../utils/colorUtils';
import { safeAsync } from '../utils/safeAsync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorSimilar } from './colorEngine';
import { getTasteProfile } from './tasteEngine';

type FeedbackAction =
  | 'worn'
  | 'liked'
  | 'skipped'
  | 'rejected'
  | 'fitcheck_loved'
  | 'fitcheck_fine'
  | 'fitcheck_bad'
  | 'swap_accepted'
  | 'swap_rejected';

export interface FeedbackSignal {
  outfitId: string;
  action: FeedbackAction;
  colorHexes: string[];
  colorFamilies: string[];
  patterns: string[];
  styleType: string;
  occasion: string;
  colorScore: number;
  skinScore: number;
  tasteScore: number;
  finalScore: number;
  timestamp: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  dayOfWeek: number;
}

interface StyleInsight {
  icon: string;
  text: string;
  confidence: number;
  basis: string;
}

interface PendingFeedback {
  outfitId: string;
  action: FeedbackAction;
  metadataReason?: string;
}

interface MutableLearningProfile {
  colorWeights: Array<{ hex: string; family: string; weight: number; interactions: number }>;
  colorFamilyWeights: Record<string, number>;
  patternWeights: Record<string, number>;
  patternRejections: Record<string, number>;
  blockedPatterns: Set<string>;
  contrastPreference: number;
  warmCoolBias: number;
  patternTolerance: number;
  accessoryInterest: number;
  formalityComfort: number;
  skinToneWeight: number;
  boldnessPreference: number;
  layeringPreference: number;
  fitPreference: 'relaxed' | 'fitted';
  styleIdentity: 'minimal' | 'classic' | 'bold' | 'traditional';
}

const SIGNAL_WEIGHTS: Record<FeedbackAction, number> = {
  worn: 0.20,
  fitcheck_loved: 0.18,
  liked: 0.10,
  fitcheck_fine: 0.03,
  swap_rejected: -0.05,
  skipped: -0.05,
  fitcheck_bad: -0.15,
  rejected: -0.18,
  swap_accepted: 0.08,
};

const feedbackQueue: PendingFeedback[] = [];
let lastInsightIds: string[] = [];

const MORNING_PREFIX = 'morning_checkin:';

function safeArrayParse(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x));
  } catch {
    return [];
  }
}

function normalizeHex(hex: string): string {
  const clean = hex.trim().replace('#', '');
  if (clean.length === 3) {
    return `#${clean.split('').map((x) => `${x}${x}`).join('').toLowerCase()}`;
  }
  return `#${clean.toLowerCase()}`;
}

function getColorFamily(hex: string): string {
  const clean = normalizeHex(hex).slice(1);
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = ((max + min) / 510) * 100;
  const saturation = max === 0 ? 0 : (delta / max) * 100;

  if (saturation < 15 || lightness < 12 || lightness > 90) return 'neutral';

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue = (hue * 60 + 360) % 360;

  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 170) return 'green';
  if (hue < 255) return 'blue';
  if (hue < 290) return 'purple';
  if (hue < 345) return 'pink';
  return 'neutral';
}

function toTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' {
  const h = date.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function normalizeAction(rawAction: string): FeedbackAction | null {
  const lower = rawAction.trim().toLowerCase();
  const base = lower.split(':')[0];

  if (base === 'fitcheck_notgreat') return 'fitcheck_bad';
  if (base === 'swap') {
    if (lower.includes('not for me') || lower.includes('reject') || lower.includes('skip')) {
      return 'swap_rejected';
    }
    return 'swap_accepted';
  }

  if (
    base === 'worn'
    || base === 'liked'
    || base === 'skipped'
    || base === 'rejected'
    || base === 'fitcheck_loved'
    || base === 'fitcheck_fine'
    || base === 'fitcheck_bad'
    || base === 'swap_accepted'
    || base === 'swap_rejected'
  ) {
    return base;
  }

  return null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function queueFeedback(outfitId: string, action: FeedbackAction, metadataReason?: string): Promise<void> {
  feedbackQueue.push({ outfitId, action, metadataReason });
}

export async function retryQueuedFeedback(): Promise<void> {
  if (!feedbackQueue.length) return;
  const copy = [...feedbackQueue];
  feedbackQueue.length = 0;
  for (const item of copy) {
    const { error } = await safeAsync(
      async () => writeFeedback(item.outfitId, item.action, item.metadataReason),
      'Feedback.retryQueue'
    );
    if (error) {
      feedbackQueue.push(item);
    }
  }
}

interface OutfitRow {
  id: string;
  occasion: string;
  item_ids: string;
  skin_score: number;
  color_score: number;
  gemini_score?: number;
  final_score: number;
}

interface ItemRow {
  id: string;
  pattern: string | null;
  color_hex: string;
  style_type: string;
}

interface FeedbackRow {
  outfit_id: string;
  action: string;
  colors: string;
  patterns: string;
  style_type: string;
  color_score: number;
  skin_score: number;
  final_score: number;
  created_at: string;
}

async function loadRecentSignals(limit = 120): Promise<FeedbackSignal[]> {
  const rows = await getAll<FeedbackRow>(
    'SELECT outfit_id, action, colors, patterns, style_type, color_score, skin_score, final_score, created_at FROM outfit_feedback ORDER BY created_at DESC LIMIT ?;',
    [limit]
  );
  if (!rows.length) return [];

  const outfitIds = uniqueStrings(
    rows.map((r) => r.outfit_id).filter((id) => id && id !== 'fitcheck')
  );

  const occasionMap: Record<string, string> = {};
  if (outfitIds.length) {
    const placeholders = outfitIds.map(() => '?').join(',');
    const outfitRows = await getAll<{ id: string; occasion: string }>(
      `SELECT id, occasion FROM outfits WHERE id IN (${placeholders});`,
      outfitIds
    );
    outfitRows.forEach((row) => {
      occasionMap[row.id] = row.occasion;
    });
  }

  return rows
    .map((row): FeedbackSignal | null => {
      const action = normalizeAction(row.action);
      if (!action) return null;

      const timestamp = Number.isNaN(Date.parse(row.created_at))
        ? Date.now()
        : Date.parse(row.created_at);
      const date = new Date(timestamp);

      const colorHexes = safeArrayParse(row.colors)
        .map((hex) => normalizeHex(hex))
        .filter((hex) => /^#[0-9a-f]{6}$/.test(hex));
      const colorFamilies = uniqueStrings(colorHexes.map((hex) => getColorFamily(hex)));
      const patterns = uniqueStrings(safeArrayParse(row.patterns).map((p) => p.trim().toLowerCase()));

      const colorScore = Number.isFinite(row.color_score) ? row.color_score : 0;
      const skinScore = Number.isFinite(row.skin_score) ? row.skin_score : 0;
      const finalScore = Number.isFinite(row.final_score) ? row.final_score : 0;
      const tasteScore = clamp((colorScore + skinScore) / 2, 0, 10);

      return {
        outfitId: row.outfit_id,
        action,
        colorHexes,
        colorFamilies,
        patterns,
        styleType: row.style_type || 'classic',
        occasion: occasionMap[row.outfit_id] || 'general',
        colorScore,
        skinScore,
        tasteScore,
        finalScore,
        timestamp,
        timeOfDay: toTimeOfDay(date),
        dayOfWeek: date.getDay(),
      };
    })
    .filter((x): x is FeedbackSignal => Boolean(x));
}

function createLearningProfile(base: Awaited<ReturnType<typeof getTasteProfile>>): MutableLearningProfile {
  const profile: MutableLearningProfile = {
    colorWeights: [],
    colorFamilyWeights: {},
    patternWeights: {},
    patternRejections: {},
    blockedPatterns: new Set(base.blockedPatterns),
    contrastPreference: base.contrastPreference,
    warmCoolBias: base.warmCoolBias,
    patternTolerance: base.patternTolerance,
    accessoryInterest: base.accessoryInterest,
    formalityComfort: base.formalityComfort,
    skinToneWeight: base.skinToneWeight,
    boldnessPreference: base.boldnessPreference,
    layeringPreference: base.layeringPreference,
    fitPreference: base.fitPreference,
    styleIdentity: base.styleIdentity,
  };

  base.lovedColors.forEach((hex) => {
    profile.colorWeights.push({
      hex: normalizeHex(hex),
      family: getColorFamily(hex),
      weight: 0.8,
      interactions: 3,
    });
  });
  base.dislikedColors.forEach((hex) => {
    profile.colorWeights.push({
      hex: normalizeHex(hex),
      family: getColorFamily(hex),
      weight: 0.2,
      interactions: 3,
    });
  });

  base.lovedPatterns.forEach((pattern) => {
    profile.patternWeights[pattern] = 0.8;
  });
  base.dislikedPatterns.forEach((pattern) => {
    profile.patternWeights[pattern] = 0.2;
    profile.patternRejections[pattern] = 2;
  });

  return profile;
}

function updateColorPreferences(signal: FeedbackSignal, profile: MutableLearningProfile): MutableLearningProfile {
  const weight = SIGNAL_WEIGHTS[signal.action];

  signal.colorHexes.forEach((hex) => {
    const family = getColorFamily(hex);
    const existing = profile.colorWeights.find((c) => colorSimilar(c.hex, hex, 30));

    if (existing) {
      existing.weight = clamp(existing.weight + weight * 0.3, 0.1, 0.9);
      existing.interactions += 1;
    } else if (weight > 0) {
      profile.colorWeights.push({
        hex: normalizeHex(hex),
        family,
        weight: clamp(0.5 + weight, 0.1, 0.9),
        interactions: 1,
      });
    }

    const familyEntry = profile.colorFamilyWeights[family] ?? 0.5;
    profile.colorFamilyWeights[family] = clamp(familyEntry + weight * 0.2, 0.1, 0.9);
  });

  profile.colorWeights = profile.colorWeights
    .sort((a, b) => b.interactions - a.interactions)
    .slice(0, 30);

  return profile;
}

function updatePatternPreferences(signal: FeedbackSignal, profile: MutableLearningProfile): MutableLearningProfile {
  const weight = SIGNAL_WEIGHTS[signal.action];

  signal.patterns.forEach((patternRaw) => {
    const pattern = patternRaw.toLowerCase();
    if (!pattern || pattern === 'solid' || pattern === 'none' || pattern === 'null') return;

    const current = profile.patternWeights[pattern] ?? 0.5;
    const next = clamp(current + weight * 0.25, 0.1, 0.9);
    profile.patternWeights[pattern] = next;

    if (next < 0.25) {
      const rejections = profile.patternRejections[pattern] ?? 0;
      profile.patternRejections[pattern] = rejections + 1;
      if (profile.patternRejections[pattern] >= 3) {
        profile.blockedPatterns.add(pattern);
      }
    }
  });

  return profile;
}

function updateCoreTaste(signal: FeedbackSignal, profile: MutableLearningProfile): MutableLearningProfile {
  const weight = SIGNAL_WEIGHTS[signal.action];
  const normalizedFinal = clamp(signal.finalScore / 10, 0, 1);

  profile.contrastPreference = clamp(profile.contrastPreference + weight * 0.12, 0.1, 0.9);
  profile.patternTolerance = clamp(profile.patternTolerance + weight * 0.10, 0.1, 0.9);
  profile.skinToneWeight = clamp(profile.skinToneWeight + (signal.skinScore >= 7 ? weight * 0.15 : -weight * 0.05), 0.1, 0.9);
  profile.boldnessPreference = clamp(profile.boldnessPreference + (signal.colorFamilies.includes('red') || signal.colorFamilies.includes('orange') ? weight * 0.14 : weight * 0.05), 0.1, 0.9);
  profile.layeringPreference = clamp(profile.layeringPreference + (signal.patterns.length > 1 ? weight * 0.08 : weight * 0.03), 0.1, 0.9);
  profile.formalityComfort = clamp(profile.formalityComfort + (signal.styleType.includes('formal') || signal.styleType.includes('professional') ? weight * 0.12 : -weight * 0.04), 0.1, 0.9);
  profile.accessoryInterest = clamp(profile.accessoryInterest + (signal.action === 'swap_accepted' ? 0.06 : signal.action === 'swap_rejected' ? -0.05 : weight * 0.03), 0.1, 0.9);
  profile.warmCoolBias = clamp(profile.warmCoolBias + ((signal.colorFamilies.includes('orange') || signal.colorFamilies.includes('yellow')) ? weight * 0.16 : (signal.colorFamilies.includes('blue') || signal.colorFamilies.includes('purple')) ? -weight * 0.16 : 0) + (normalizedFinal - 0.5) * 0.03, 0.1, 0.9);

  return profile;
}

function deriveExplicitPreferences(profile: MutableLearningProfile): {
  lovedColors: string[];
  dislikedColors: string[];
  lovedPatterns: string[];
  dislikedPatterns: string[];
} {
  const lovedColors = profile.colorWeights
    .filter((c) => c.weight > 0.65)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((c) => c.hex);

  const dislikedColors = profile.colorWeights
    .filter((c) => c.weight < 0.35)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, 8)
    .map((c) => c.hex);

  const lovedPatterns = Object.entries(profile.patternWeights)
    .filter(([, w]) => w > 0.65)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([pattern]) => pattern);

  const dislikedPatterns = Object.entries(profile.patternWeights)
    .filter(([, w]) => w < 0.35)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 8)
    .map(([pattern]) => pattern);

  return { lovedColors, dislikedColors, lovedPatterns, dislikedPatterns };
}

function generateInsights(profile: MutableLearningProfile, feedbackHistory: FeedbackSignal[]): StyleInsight[] {
  const insights: StyleInsight[] = [];
  const recent = feedbackHistory.slice(0, 50);

  const colorFamilyCounts = recent
    .filter((f) => f.action === 'worn' || f.action === 'liked')
    .flatMap((f) => f.colorFamilies)
    .reduce((acc, family) => {
      acc[family] = (acc[family] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const topFamily = Object.entries(colorFamilyCounts).sort(([, a], [, b]) => b - a)[0];
  if (topFamily && topFamily[1] >= 3) {
    insights.push({
      icon: 'palette',
      text: `${topFamily[0]} tones are your most worn color family`,
      confidence: Math.min(topFamily[1] / 10, 1),
      basis: `Based on ${topFamily[1]} outfit interactions`,
    });
  }

  const avoidedPatterns = Object.entries(profile.patternWeights)
    .filter(([, w]) => w < 0.35)
    .map(([pattern]) => pattern);
  if (avoidedPatterns.length > 0) {
    insights.push({
      icon: 'do_not_disturb',
      text: `You consistently skip ${avoidedPatterns.join(' and ')} patterns`,
      confidence: 0.85,
      basis: `Based on ${avoidedPatterns.length} pattern preferences`,
    });
  }

  const occasions = recent
    .filter((f) => f.action === 'worn')
    .reduce((acc, f) => {
      acc[f.occasion] = (acc[f.occasion] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  const topOccasion = Object.entries(occasions).sort(([, a], [, b]) => b - a)[0];
  if (topOccasion && topOccasion[1] >= 2) {
    insights.push({
      icon: 'event',
      text: `Your wardrobe is strongest for ${topOccasion[0]} occasions`,
      confidence: 0.8,
      basis: `Worn ${topOccasion[0]} outfits ${topOccasion[1]} times`,
    });
  }

  const chronological = [...recent].reverse();
  const earlyScores = chronological.slice(0, 10).filter((f) => f.action === 'worn').map((f) => f.finalScore);
  const recentScores = chronological.slice(-10).filter((f) => f.action === 'worn').map((f) => f.finalScore);
  if (earlyScores.length >= 3 && recentScores.length >= 3) {
    const earlyAvg = earlyScores.reduce((a, b) => a + b, 0) / earlyScores.length;
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    if (recentAvg > earlyAvg + 0.5) {
      insights.push({
        icon: 'trending_up',
        text: 'Outfit suggestions are getting more accurate over time',
        confidence: 0.9,
        basis: `Score improved from ${earlyAvg.toFixed(1)} to ${recentAvg.toFixed(1)}`,
      });
    }
  }

  return insights.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

export function buildPersonalizedContext(profile: TasteProfile | MutableLearningProfile, feedbackHistory: FeedbackSignal[]): string {
  const internalProfile = 'colorWeights' in profile
    ? profile
    : createLearningProfile(profile);

  const topColors = internalProfile.colorWeights
    .filter((c) => c.weight > 0.65)
    .slice(0, 5)
    .map((c) => c.family);

  const avoidColors = internalProfile.colorWeights
    .filter((c) => c.weight < 0.35)
    .slice(0, 3)
    .map((c) => c.family);

  const topPatterns = Object.entries(internalProfile.patternWeights)
    .filter(([, w]) => w > 0.65)
    .map(([pattern]) => pattern);

  const totalWorn = feedbackHistory.filter((f) => f.action === 'worn').length;

  return [
    `Learned user preferences (from ${feedbackHistory.length} interactions):`,
    `- Loves: ${topColors.join(', ') || 'learning...'}`,
    `- Avoids: ${avoidColors.join(', ') || 'none yet'}`,
    `- Preferred patterns: ${topPatterns.join(', ') || 'all patterns'}`,
    `- Outfits worn: ${totalWorn}`,
    `- Personalization level: ${totalWorn > 20 ? 'High' : totalWorn > 10 ? 'Medium' : 'Building'}`,
  ].join('\n');
}

async function writeFeedback(outfitId: string, action: FeedbackAction, metadataReason?: string): Promise<void> {
  const outfit = await getOne<OutfitRow>('SELECT id, occasion, item_ids, skin_score, color_score, gemini_score, final_score FROM outfits WHERE id = ?;', [outfitId]);
  if (!outfit) return;

  const ids = JSON.parse(outfit.item_ids) as string[];
  const placeholders = ids.map(() => '?').join(',');
  const items = ids.length
    ? await getAll<ItemRow>(`SELECT id, pattern, color_hex, style_type FROM clothing_items WHERE id IN (${placeholders});`, ids)
    : [];

  await executeSqlWithRetry(
    `INSERT INTO outfit_feedback (id, outfit_id, action, item_ids, colors, patterns, style_type, skin_score, color_score, final_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
    [
      `${action}-${Date.now()}`,
      outfitId,
      metadataReason ? `${action}:${metadataReason}` : action,
      JSON.stringify(ids),
      JSON.stringify(items.map((i) => i.color_hex)),
      JSON.stringify(items.map((i) => i.pattern ?? 'solid')),
      items[0]?.style_type ?? 'classic',
      outfit.skin_score,
      outfit.color_score,
      outfit.final_score,
    ]
  );
}

async function writeFeedbackWithQueue(outfitId: string, action: FeedbackAction, metadataReason?: string): Promise<void> {
  const { error } = await safeAsync(
    async () => writeFeedback(outfitId, action, metadataReason),
    'Feedback.writeWithQueue'
  );
  if (error) {
    await queueFeedback(outfitId, action, metadataReason);
  }
}

export async function recordWorn(outfitId: string): Promise<void> {
  await writeFeedbackWithQueue(outfitId, 'worn');
  const outfit = await getOne<{ item_ids: string }>('SELECT item_ids FROM outfits WHERE id = ?;', [outfitId]);
  if (!outfit) return;
  const ids = JSON.parse(outfit.item_ids) as string[];
  await safeAsync(
    async () => AsyncStorage.setItem(`${MORNING_PREFIX}${outfitId}`, JSON.stringify({ wornAt: Date.now(), rated: false, shown: false })),
    'Feedback.cacheMorningWorn'
  );
  await Promise.all(
    ids.map((id) => safeAsync(
      async () => executeSqlWithRetry('UPDATE clothing_items SET times_worn = times_worn + 1, last_worn = datetime(\'now\') WHERE id = ?;', [id]),
      'Feedback.incrementWearCount'
    ))
  );
}

export async function recordLiked(outfitId: string): Promise<void> {
  await writeFeedbackWithQueue(outfitId, 'liked');
}

export async function recordSkipped(outfitId: string, reason?: string): Promise<void> {
  await writeFeedbackWithQueue(outfitId, 'skipped', reason);
}

export async function recordRejected(outfitId: string, reason?: string): Promise<void> {
  await writeFeedbackWithQueue(outfitId, 'rejected', reason);
  const pattern = reason?.trim().toLowerCase() ?? '';
  if (!pattern) return;
  const row = await getOne<{ count: number }>('SELECT COUNT(*) as count FROM outfit_feedback WHERE action = ? AND patterns LIKE ?;', ['rejected', `%${pattern}%`]);
  if ((row?.count ?? 0) === 3) {
    await addBlockedPattern(pattern);

    const prefs = await getOne<{ blocked_notice_seen: number }>('SELECT blocked_notice_seen FROM explicit_preferences WHERE id = ?;', ['prefs']);
    if ((prefs?.blocked_notice_seen ?? 0) === 0) {
      await executeSqlWithRetry('UPDATE explicit_preferences SET blocked_notice_seen = 1 WHERE id = ?;', ['prefs']);
    }
  }
}

export async function recordFitCheckRating(fitCheckId: string, rating: 'loved' | 'fine' | 'notGreat'): Promise<void> {
  const normalizedAction: FeedbackAction = rating === 'loved'
    ? 'fitcheck_loved'
    : rating === 'fine'
      ? 'fitcheck_fine'
      : 'fitcheck_bad';
  await safeAsync(
    async () => executeSqlWithRetry(
      `INSERT INTO outfit_feedback (id, outfit_id, action, item_ids, colors, patterns, style_type, skin_score, color_score, final_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
      [`fitcheck-${Date.now()}`, fitCheckId, normalizedAction, '[]', '[]', '[]', 'fitcheck', 0, 0, 0]
    ),
    'Feedback.saveFitCheckRating'
  );
  await safeAsync(
    async () => AsyncStorage.mergeItem(`${MORNING_PREFIX}${fitCheckId}`, JSON.stringify({ rated: true })),
    'Feedback.cacheMorningRated'
  );
}

export async function recordSwapRequest(outfitId: string, swappedItemId: string, reason: string): Promise<void> {
  const action: FeedbackAction = /not for me|reject|skip|no/i.test(reason) ? 'swap_rejected' : 'swap_accepted';
  await writeFeedbackWithQueue(outfitId, action, `${swappedItemId}:${reason}`);
}

export async function addBlockedPattern(patternType: string): Promise<void> {
  await executeSqlWithRetry(
    'INSERT OR IGNORE INTO blocked_patterns (id, pattern_type, reason, blocked_at) VALUES (?, ?, ?, datetime(\'now\'));',
    [`block-${patternType}`, patternType, 'Auto blocked from repeated rejection']
  );
}

export async function recalculateTasteWeights(): Promise<void> {
  const signals = await loadRecentSignals(150);
  if (signals.length < 5) return;

  const current = await getTasteProfile();
  const learning = createLearningProfile(current);

  signals.forEach((signal) => {
    updateColorPreferences(signal, learning);
    updatePatternPreferences(signal, learning);
    updateCoreTaste(signal, learning);
  });

  const explicit = deriveExplicitPreferences(learning);
  const nextFeedbackCount = Math.max(current.feedbackCount, signals.length);

  await executeSqlWithRetry(
    `UPDATE taste_profile SET contrast_preference = ?, warm_cool_bias = ?, pattern_tolerance = ?,
     accessory_interest = ?, formality_comfort = ?, skin_tone_weight = ?, boldness_preference = ?,
     layering_preference = ?, feedback_count = ?, last_updated = datetime('now') WHERE id = 'taste';`,
    [
      learning.contrastPreference,
      learning.warmCoolBias,
      learning.patternTolerance,
      learning.accessoryInterest,
      learning.formalityComfort,
      learning.skinToneWeight,
      learning.boldnessPreference,
      learning.layeringPreference,
      nextFeedbackCount,
    ]
  );

  await executeSqlWithRetry(
    `UPDATE explicit_preferences
       SET loved_colors = ?, disliked_colors = ?, loved_patterns = ?, disliked_patterns = ?, updated_at = datetime('now')
     WHERE id = 'prefs';`,
    [
      JSON.stringify(explicit.lovedColors),
      JSON.stringify(explicit.dislikedColors),
      JSON.stringify(explicit.lovedPatterns),
      JSON.stringify(explicit.dislikedPatterns),
    ]
  );

  for (const pattern of learning.blockedPatterns) {
    await safeAsync(
      async () => addBlockedPattern(pattern),
      'Feedback.autoBlockPattern'
    );
  }

  if (__DEV__) {
    const context = buildPersonalizedContext(learning, signals);
    console.log('[Taste] Personalized context rebuilt:\n' + context);
  }
}

export async function detectTasteInsights(): Promise<TasteInsight[]> {
  const signals = await loadRecentSignals(100);
  const base = await getTasteProfile();
  const learning = createLearningProfile(base);
  signals.forEach((signal) => {
    updateColorPreferences(signal, learning);
    updatePatternPreferences(signal, learning);
  });

  const generated = generateInsights(learning, signals);
  const normalized: TasteInsight[] = generated
    .map((insight, idx) => ({
      id: `${insight.icon}_${idx}_${Math.round(insight.confidence * 100)}`,
      text: insight.text,
    }))
    .filter((insight) => !lastInsightIds.includes(insight.id))
    .slice(0, 5);

  if (!normalized.length) {
    normalized.push({ id: 'base', text: 'Keep rating outfits so FitMind can sharpen your style profile.' });
  }

  lastInsightIds = normalized.map((x) => x.id);
  return normalized;
}

export async function getPendingMorningCheckIn(): Promise<{ outfitId: string } | null> {
  const keys = await AsyncStorage.getAllKeys();
  const morningKeys = keys.filter((k) => k.startsWith(MORNING_PREFIX));

  for (const key of morningKeys) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    const payload = JSON.parse(raw) as { wornAt: number; rated: boolean; shown: boolean };
    const ageMs = Date.now() - payload.wornAt;

    if (ageMs > 48 * 60 * 60 * 1000) {
      await AsyncStorage.removeItem(key);
      continue;
    }

    const yesterdayMs = 24 * 60 * 60 * 1000;
    const isYesterday = ageMs >= yesterdayMs && ageMs <= 48 * 60 * 60 * 1000;
    if (isYesterday && !payload.rated && !payload.shown) {
      await AsyncStorage.mergeItem(key, JSON.stringify({ shown: true }));
      return { outfitId: key.replace(MORNING_PREFIX, '') };
    }
  }

  return null;
}

export async function dismissMorningCheckIn(outfitId: string): Promise<void> {
  await AsyncStorage.mergeItem(`${MORNING_PREFIX}${outfitId}`, JSON.stringify({ shown: true }));
}

export async function getLearningProgress(): Promise<{ count: number; nextMilestone: number; accuracyTrend: 'improving' | 'stable' }> {
  const signals = await loadRecentSignals(200);
  const count = signals.length;
  const nextMilestone = Math.ceil((count + 1) / 5) * 5;

  const wornChronological = [...signals]
    .filter((s) => s.action === 'worn')
    .sort((a, b) => a.timestamp - b.timestamp);

  const early = wornChronological.slice(0, 10).map((s) => s.finalScore);
  const recent = wornChronological.slice(-10).map((s) => s.finalScore);

  const earlyAvg = early.length ? early.reduce((sum, value) => sum + value, 0) / early.length : 0;
  const recentAvg = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 0;
  const accuracyTrend: 'improving' | 'stable' = recentAvg > earlyAvg + 0.5 ? 'improving' : 'stable';

  return { count, nextMilestone, accuracyTrend };
}
