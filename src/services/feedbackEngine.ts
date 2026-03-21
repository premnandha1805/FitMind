import { executeSqlWithRetry, getAll, getOne } from '../db/queries';
import { TasteInsight } from '../types/models';
import { clamp } from '../utils/colorUtils';
import { safeAsync } from '../utils/safeAsync';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PendingFeedback {
  outfitId: string;
  action: string;
  metadataReason?: string;
}

const feedbackQueue: PendingFeedback[] = [];
let lastInsightIds: string[] = [];

const MORNING_PREFIX = 'morning_checkin:';

async function queueFeedback(outfitId: string, action: string, metadataReason?: string): Promise<void> {
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
  item_ids: string;
  skin_score: number;
  color_score: number;
  final_score: number;
}

interface ItemRow {
  id: string;
  pattern: string | null;
  color_hex: string;
  style_type: string;
}

async function writeFeedback(outfitId: string, action: string, metadataReason?: string): Promise<void> {
  const outfit = await getOne<OutfitRow>('SELECT id, item_ids, skin_score, color_score, final_score FROM outfits WHERE id = ?;', [outfitId]);
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

async function writeFeedbackWithQueue(outfitId: string, action: string, metadataReason?: string): Promise<void> {
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
  await safeAsync(
    async () => executeSqlWithRetry(
      `INSERT INTO outfit_feedback (id, outfit_id, action, item_ids, colors, patterns, style_type, skin_score, color_score, final_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
      [`fitcheck-${Date.now()}`, fitCheckId, `fitcheck_${rating}`, '[]', '[]', '[]', 'fitcheck', 0, 0, 0]
    ),
    'Feedback.saveFitCheckRating'
  );
  await safeAsync(
    async () => AsyncStorage.mergeItem(`${MORNING_PREFIX}${fitCheckId}`, JSON.stringify({ rated: true })),
    'Feedback.cacheMorningRated'
  );
}

export async function recordSwapRequest(outfitId: string, swappedItemId: string, reason: string): Promise<void> {
  await writeFeedbackWithQueue(outfitId, 'swap', `${swappedItemId}:${reason}`);
}

export async function addBlockedPattern(patternType: string): Promise<void> {
  await executeSqlWithRetry(
    'INSERT OR IGNORE INTO blocked_patterns (id, pattern_type, reason, blocked_at) VALUES (?, ?, ?, datetime(\'now\'));',
    [`block-${patternType}`, patternType, 'Auto blocked from repeated rejection']
  );
}

export async function recalculateTasteWeights(): Promise<void> {
  const countRow = await getOne<{ count: number }>('SELECT COUNT(*) as count FROM outfit_feedback;');
  if ((countRow?.count ?? 0) < 5) {
    return;
  }

  const last50 = await getAll<{ action: string; patterns: string; colors: string; final_score: number; skin_score: number }>(
    'SELECT action, patterns, colors, final_score, skin_score FROM outfit_feedback ORDER BY created_at DESC LIMIT 50;'
  );

  if (!last50.length) return;

  const positive = last50.filter((x) => x.action.startsWith('worn') || x.action.startsWith('liked') || x.action.startsWith('fitcheck_loved'));
  const negative = last50.filter((x) => x.action.startsWith('skipped') || x.action.startsWith('rejected') || x.action.startsWith('fitcheck_notGreat'));

  const warmPos = positive.filter((x) => x.colors.toLowerCase().includes('ff7f50') || x.colors.toLowerCase().includes('d4a017')).length;
  const warmNeg = negative.filter((x) => x.colors.toLowerCase().includes('ff7f50') || x.colors.toLowerCase().includes('d4a017')).length;

  const patternPos = positive.filter((x) => x.patterns !== '[]').length;
  const patternNeg = negative.filter((x) => x.patterns !== '[]').length;

  const highSkinPos = positive.filter((x) => x.skin_score >= 7).length;
  const highSkinNeg = negative.filter((x) => x.skin_score >= 7).length;

  const contrastDelta = clamp((positive.length - negative.length) / Math.max(1, last50.length), -0.2, 0.2);
  const warmDelta = clamp((warmPos - warmNeg) / Math.max(1, last50.length), -0.2, 0.2);
  const patternDelta = clamp((patternPos - patternNeg) / Math.max(1, last50.length), -0.2, 0.2);
  const skinDelta = clamp((highSkinPos - highSkinNeg) / Math.max(1, last50.length), -0.2, 0.2);

  const current = await getOne<{
    contrast_preference: number;
    warm_cool_bias: number;
    pattern_tolerance: number;
    accessory_interest: number;
    formality_comfort: number;
    skin_tone_weight: number;
    boldness_preference: number;
    layering_preference: number;
    feedback_count: number;
  }>('SELECT * FROM taste_profile WHERE id = ?;', ['taste']);

  if (!current) return;

  const before = {
    contrast: current.contrast_preference,
    warm: current.warm_cool_bias,
    pattern: current.pattern_tolerance,
    accessory: current.accessory_interest,
    formality: current.formality_comfort,
    skin: current.skin_tone_weight,
    boldness: current.boldness_preference,
    layering: current.layering_preference,
  };

  const next = {
    contrast: clamp(current.contrast_preference + (contrastDelta * 0.3), 0.1, 0.9),
    warm: clamp(current.warm_cool_bias + (warmDelta * 0.3), 0.1, 0.9),
    pattern: clamp(current.pattern_tolerance + (patternDelta * 0.3), 0.1, 0.9),
    accessory: clamp(current.accessory_interest + (contrastDelta * 0.5 * 0.3), 0.1, 0.9),
    formality: clamp(current.formality_comfort + (contrastDelta * 0.2 * 0.3), 0.1, 0.9),
    skin: clamp(current.skin_tone_weight + (skinDelta * 0.3), 0.1, 0.9),
    boldness: clamp(current.boldness_preference + (contrastDelta * 0.3), 0.1, 0.9),
    layering: clamp(current.layering_preference + (patternDelta * 0.2 * 0.3), 0.1, 0.9),
    feedbackCount: current.feedback_count + 1,
  };

  console.log('[Taste] Weights updated:', before, next);

  await executeSqlWithRetry(
    `UPDATE taste_profile SET contrast_preference = ?, warm_cool_bias = ?, pattern_tolerance = ?,
     accessory_interest = ?, formality_comfort = ?, skin_tone_weight = ?, boldness_preference = ?,
     layering_preference = ?, feedback_count = ?, last_updated = datetime('now') WHERE id = 'taste';`,
    [next.contrast, next.warm, next.pattern, next.accessory, next.formality, next.skin, next.boldness, next.layering, next.feedbackCount]
  );
}

export async function detectTasteInsights(): Promise<TasteInsight[]> {
  const rows = await getAll<{ action: string; patterns: string; colors: string; style_type: string }>(
    'SELECT action, patterns, colors, style_type FROM outfit_feedback ORDER BY created_at DESC LIMIT 80;'
  );

  const candidates: Array<{ id: string; text: string; confidence: number }> = [];
  const skippedFloral = rows.filter((r) => r.action.startsWith('skipped') && r.patterns.toLowerCase().includes('floral')).length;
  const skippedChecked = rows.filter((r) => r.action.startsWith('skipped') && r.patterns.toLowerCase().includes('check')).length;
  if (skippedFloral + skippedChecked >= 3) {
    candidates.push({ id: 'pattern_skip', text: 'You always skip floral and checked patterns.', confidence: skippedFloral + skippedChecked });
  }

  const warmEarthWear = rows.filter((r) => (r.action.startsWith('worn') || r.action.startsWith('liked')) && /(ff7f50|b7410e|d4a017)/i.test(r.colors)).length;
  if (warmEarthWear >= 3) {
    candidates.push({ id: 'warm_earth', text: 'You wear warm earth tones most often.', confidence: warmEarthWear });
  }

  const formalWear = rows.filter((r) => (r.action.startsWith('worn') || r.action.startsWith('liked')) && /(formal|professional)/i.test(r.style_type)).length;
  const casualWear = rows.filter((r) => (r.action.startsWith('worn') || r.action.startsWith('liked')) && /(casual|minimal|classic)/i.test(r.style_type)).length;
  if (formalWear > casualWear + 1) {
    candidates.push({ id: 'formal_pref', text: 'You choose polished formal looks more often than casual outfits.', confidence: formalWear - casualWear });
  } else if (casualWear > formalWear + 1) {
    candidates.push({ id: 'casual_pref', text: 'You prefer relaxed casual looks over formal combinations.', confidence: casualWear - formalWear });
  }

  const accessoryRejects = rows.filter((r) => r.action.startsWith('swap') && r.action.toLowerCase().includes('accessory')).length;
  if (accessoryRejects >= 2) {
    candidates.push({ id: 'acc_skip', text: 'You rarely keep accessory swap suggestions.', confidence: accessoryRejects });
  }

  const filtered = candidates
    .filter((c) => !lastInsightIds.includes(c.id))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((c) => ({ id: c.id, text: c.text }));

  if (!filtered.length) {
    filtered.push({ id: 'base', text: 'Keep rating outfits so FitMind can sharpen your style profile.' });
  }

  lastInsightIds = filtered.map((x) => x.id);
  return filtered;
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
  const allCount = await getOne<{ count: number }>('SELECT COUNT(*) as count FROM outfit_feedback;');
  const count = allCount?.count ?? 0;
  const nextMilestone = Math.ceil((count + 1) / 5) * 5;

  const earlyRows = await getAll<{ final_score: number }>(
    "SELECT final_score FROM outfit_feedback WHERE action = 'worn' ORDER BY created_at ASC LIMIT 10;"
  );
  const recentRows = await getAll<{ final_score: number }>(
    "SELECT final_score FROM outfit_feedback WHERE action = 'worn' ORDER BY created_at DESC LIMIT 10;"
  );

  const earlyAvg = earlyRows.length ? earlyRows.reduce((sum, r) => sum + (r.final_score ?? 0), 0) / earlyRows.length : 0;
  const recentAvg = recentRows.length ? recentRows.reduce((sum, r) => sum + (r.final_score ?? 0), 0) / recentRows.length : 0;
  const accuracyTrend: 'improving' | 'stable' = recentAvg > earlyAvg + 0.5 ? 'improving' : 'stable';

  return { count, nextMilestone, accuracyTrend };
}
