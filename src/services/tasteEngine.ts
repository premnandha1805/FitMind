import { getAll, getOne } from '../db/queries';
import { ClothingItem, TasteProfile, OutfitCandidate } from '../types/models';
import { clamp } from '../utils/colorUtils';

interface TasteRow {
  contrast_preference: number;
  warm_cool_bias: number;
  pattern_tolerance: number;
  accessory_interest: number;
  formality_comfort: number;
  skin_tone_weight: number;
  boldness_preference: number;
  layering_preference: number;
  feedback_count: number;
  last_updated: string | null;
}

interface PrefRow {
  loved_colors: string;
  disliked_colors: string;
  loved_patterns: string;
  disliked_patterns: string;
  fit_preference: 'relaxed' | 'fitted';
  style_identity: 'minimal' | 'classic' | 'bold' | 'traditional';
}

export async function getTasteProfile(): Promise<TasteProfile> {
  const taste = await getOne<TasteRow>('SELECT * FROM taste_profile WHERE id = ?;', ['taste']);
  const prefs = await getOne<PrefRow>('SELECT * FROM explicit_preferences WHERE id = ?;', ['prefs']);
  const blocked = await getAll<{ pattern_type: string }>('SELECT pattern_type FROM blocked_patterns;');

  return {
    contrastPreference: taste?.contrast_preference ?? 0.5,
    warmCoolBias: taste?.warm_cool_bias ?? 0.5,
    patternTolerance: taste?.pattern_tolerance ?? 0.5,
    accessoryInterest: taste?.accessory_interest ?? 0.5,
    formalityComfort: taste?.formality_comfort ?? 0.5,
    skinToneWeight: taste?.skin_tone_weight ?? 0.6,
    boldnessPreference: taste?.boldness_preference ?? 0.5,
    layeringPreference: taste?.layering_preference ?? 0.5,
    feedbackCount: taste?.feedback_count ?? 0,
    lastUpdated: taste?.last_updated ?? null,
    lovedColors: JSON.parse(prefs?.loved_colors ?? '[]') as string[],
    dislikedColors: JSON.parse(prefs?.disliked_colors ?? '[]') as string[],
    lovedPatterns: JSON.parse(prefs?.loved_patterns ?? '[]') as string[],
    dislikedPatterns: JSON.parse(prefs?.disliked_patterns ?? '[]') as string[],
    fitPreference: prefs?.fit_preference ?? 'relaxed',
    styleIdentity: prefs?.style_identity ?? 'classic',
    blockedPatterns: blocked.map((b) => b.pattern_type),
  };
}

export function scoreCandidateAgainstTaste(candidate: OutfitCandidate, tasteProfile: TasteProfile): number {
  const patterns = [candidate.top.pattern, candidate.bottom.pattern, candidate.shoes?.pattern, candidate.accessory?.pattern]
    .filter((x): x is ClothingItem['pattern'] => Boolean(x));
  const colors = [candidate.top.colorHex, candidate.bottom.colorHex, candidate.shoes?.colorHex, candidate.accessory?.colorHex]
    .filter((x): x is string => Boolean(x));

  if (patterns.some((p) => tasteProfile.blockedPatterns.includes(p))) {
    return -1;
  }

  let score = 5;
  colors.forEach((c) => {
    if (tasteProfile.lovedColors.includes(c)) score += 2;
    if (tasteProfile.dislikedColors.includes(c)) score -= 3;
  });
  patterns.forEach((p) => {
    if (tasteProfile.lovedPatterns.includes(p)) score += 2;
    if (tasteProfile.dislikedPatterns.includes(p)) score -= 3;
  });

  const hasAccessory = Boolean(candidate.accessory);
  if (!hasAccessory && tasteProfile.accessoryInterest < 0.4) {
    score += 0.5;
  }

  const statementPieces = [candidate.top, candidate.bottom].filter((item) => {
    const s = Number.parseFloat(item.colorHsl.split(',')[1] ?? '0');
    return s > 50;
  }).length;

  score += (statementPieces > 0 ? 1 : -1) * (tasteProfile.boldnessPreference - 0.5) * 2;
  score += (candidate.top.category === 'outerwear' ? 1 : 0) * (tasteProfile.layeringPreference - 0.5) * 2;
  score += (candidate.layer2Score - 5) * tasteProfile.skinToneWeight * 0.2;
  score += (candidate.layer1Score - 5) * tasteProfile.contrastPreference * 0.15;

  return clamp(score, 0, 10);
}

export function explainOutfitChoice(candidate: OutfitCandidate, tasteProfile: TasteProfile): string[] {
  const reasons: string[] = [];
  if (candidate.layer2Score >= 8) reasons.push(`Top color complements your skin tone beautifully (${candidate.layer2Score.toFixed(0)}/10)`);
  if ((candidate.top.pattern ?? 'solid') === 'solid') reasons.push('Solid pattern - matches your style preference');
  if (candidate.layer1Score >= 7) reasons.push('High color harmony supports your preferred contrast');
  if (tasteProfile.lovedColors.includes(candidate.top.colorHex)) reasons.push('Top color is one of your saved favorites');
  if (tasteProfile.boldnessPreference >= 0.6) reasons.push('Contrast level suits your boldness preference');
  if (!reasons.length) reasons.push('Balanced tones and strong fit to your current style profile');
  return reasons;
}
