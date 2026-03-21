import { CATEGORY_BY_OCCASION } from '../constants/styleRules';
import { Outfit, OutfitCandidate, ClothingItem, TasteProfile, UserProfile } from '../types/models';
import { apply60_30_10Rule, parseHSL, scoreColorPair, scoreContrastLevel, scoreOutfitForSkinTone } from './colorEngine';
import { validateWithGemini } from './gemini';
import { recalculateTasteWeights } from './feedbackEngine';
import { explainOutfitChoice, scoreCandidateAgainstTaste } from './tasteEngine';
import { safeAsync } from '../utils/safeAsync';
import { getAll } from '../db/queries';

function getCurrentSeasonMode(): 'summer' | 'winter' {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'summer';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'winter';
  return 'winter';
}

function isSeasonAllowed(item: ClothingItem, seasonMode: 'summer' | 'winter'): boolean {
  const season = (item.season ?? 'all-season').toLowerCase();
  if (season === 'all-season') return true;
  if (seasonMode === 'summer') return season !== 'winter';
  return season !== 'summer';
}

export function generateOutfitName(occasion: string, colorScore: number, skinScore: number): string {
  const high = colorScore >= 8 && skinScore >= 8;
  const medium = colorScore >= 6 || skinScore >= 6;

  let base = 'Smart Outfit Pick';
  if (occasion === 'formal' && high) base = 'Sharp Professional Look';
  else if (occasion === 'formal' && medium) base = 'Polished Office Ready';
  else if (occasion === 'casual' && high) base = 'Effortless Weekend Vibe';
  else if (occasion === 'casual' && medium) base = 'Relaxed Daily Outfit';
  else if (occasion === 'party' && high) base = 'Bold Night Out Look';
  else if (occasion === 'party' && medium) base = 'Fun Party Ready';
  else if (occasion === 'ethnic') base = 'Elegant Traditional Look';
  else if (occasion === 'professional' && high) base = 'Confident Work Ensemble';

  if (skinScore >= 8) {
    return `${base} - Especially Flattering For Your Tone`;
  }

  return base;
}

export function filterByOccasion(items: ClothingItem[], occasion: string): ClothingItem[] {
  const allowed = CATEGORY_BY_OCCASION[occasion] ?? CATEGORY_BY_OCCASION.casual;
  const byOccasion = items.filter((i) => allowed.includes(i.styleType));
  const seasonMode = getCurrentSeasonMode();
  const seasonFiltered = byOccasion.filter((item) => isSeasonAllowed(item, seasonMode));

  const seasonTops = seasonFiltered.filter((i) => i.category === 'top').length;
  const seasonBottoms = seasonFiltered.filter((i) => i.category === 'bottom').length;

  if (seasonTops < 3 || seasonBottoms < 3) {
    const allSeasonOnly = byOccasion.filter((item) => (item.season ?? 'all-season').toLowerCase() === 'all-season');
    return allSeasonOnly.length ? allSeasonOnly : byOccasion;
  }

  return seasonFiltered.length ? seasonFiltered : byOccasion;
}

export function applyColorRules(items: ClothingItem[]): OutfitCandidate[] {
  const tops = items.filter((i) => i.category === 'top');
  const bottoms = items.filter((i) => i.category === 'bottom');
  const shoes = items.filter((i) => i.category === 'shoes');
  const accessories = items.filter((i) => i.category === 'accessory');
  const outerwear = items.filter((i) => i.category === 'outerwear');

  if (tops.length < 1 || bottoms.length < 1) {
    return [];
  }

  const result: OutfitCandidate[] = [];
  const shoesOptions: Array<ClothingItem | null> = [null, ...shoes.slice(0, 2)];
  const accessoryOptions: Array<ClothingItem | null> = [null, ...accessories.slice(0, 2)];
  const outerwearOptions: Array<ClothingItem | null> = [null, ...outerwear.slice(0, 2)];
  let combinations = 0;

  tops.forEach((top) => {
    bottoms.forEach((bottom) => {
      if (combinations >= 50) return;
      shoesOptions.forEach((shoe) => {
        if (combinations >= 50) return;
        accessoryOptions.forEach((accessory) => {
          if (combinations >= 50) return;
          outerwearOptions.forEach((outer) => {
            if (combinations >= 50) return;
            combinations += 1;

            const candidate: OutfitCandidate = {
              top,
              bottom,
              shoes: shoe,
              accessory,
              outerwear: outer,
              layer1Score: 0,
              layer2Score: 0,
              layer3Score: 0,
              geminiScore: 0,
              finalScore: 0,
              reasons: [],
            };

            const topH = parseHSL(top.colorHsl);
            const bottomH = parseHSL(bottom.colorHsl);
            const pairScore = scoreColorPair(topH, bottomH);
            const statementTop = topH.s > 50;
            const statementBottom = bottomH.s > 50;
            if (statementTop && statementBottom && Math.abs(topH.h - bottomH.h) > 60) return;

            const composition = apply60_30_10Rule(candidate);
            const totalLayer1 = pairScore + composition.ruleScoreAdjustment;
            if (totalLayer1 < 6) return;

            result.push({ ...candidate, layer1Score: Math.max(0, Math.min(10, totalLayer1)) });
          });
        });
      });
    });
  });

  return result;
}

export function applySkinToneFilter(candidates: OutfitCandidate[], toneId: number, undertone: 'Warm' | 'Cool' | 'Neutral', threshold = 5): OutfitCandidate[] {
  return candidates
    .map((c) => {
      const skinToneScore = scoreOutfitForSkinTone(c, toneId, undertone);
      const contrastScore = scoreContrastLevel(c, toneId);
      const combined = skinToneScore * 0.6 + contrastScore * 0.4;
      return { ...c, layer2Score: combined };
    })
    .filter((c) => c.layer2Score >= threshold)
    .sort((a, b) => b.layer2Score - a.layer2Score);
}

export function applyTasteFilter(candidates: OutfitCandidate[], tasteProfile: TasteProfile, threshold = 4): OutfitCandidate[] {
  const scored = candidates
    .map((c) => ({ ...c, layer3Score: scoreCandidateAgainstTaste(c, tasteProfile) }))
    .filter((c) => c.layer3Score >= threshold)
    .filter((c) => {
      const patterns = [c.top.pattern, c.bottom.pattern, c.shoes?.pattern, c.accessory?.pattern].filter((x): x is string => Boolean(x));
      const blocked = patterns.some((p) => tasteProfile.blockedPatterns.includes(p));
      return !blocked;
    })
    .sort((a, b) => b.layer3Score - a.layer3Score);

  const withoutDislikedColors = scored.filter((c) => ![c.top.colorHex, c.bottom.colorHex, c.shoes?.colorHex, c.accessory?.colorHex]
    .filter((x): x is string => Boolean(x))
    .some((hex) => tasteProfile.dislikedColors.includes(hex)));

  return withoutDislikedColors.length ? withoutDislikedColors : scored;
}

async function applyGeminiLayer(
  candidates: OutfitCandidate[],
  user: UserProfile,
  tasteProfile: TasteProfile
): Promise<OutfitCandidate[]> {
  const top6 = candidates.slice(0, 6);
  const { data: ratings, error } = await safeAsync(
    async () => validateWithGemini(top6, `Tone ${user.skinToneId}`, user.skinUndertone, tasteProfile.styleIdentity, 'neutral', `${tasteProfile.patternTolerance}`),
    'Outfit.applyGeminiLayer'
  );

  if (error || !ratings) {
    return top6.map((c) => ({ ...c, geminiScore: 0, finalScore: c.layer3Score, reasons: [...c.reasons, 'AI validation unavailable'] }));
  }

  const rated = top6.map((c, index) => {
    const match = ratings.find((r) => r.index === index);
    const geminiScore = match?.score ?? 0;
    const finalScore = c.layer1Score * 0.2 + c.layer2Score * 0.25 + c.layer3Score * 0.3 + geminiScore * 0.25;
    return {
      ...c,
      geminiScore,
      finalScore,
      reasons: match?.reason ? [...c.reasons, match.reason] : c.reasons,
    };
  }).filter((c) => c.geminiScore >= 7);

  return rated.length ? rated : top6;
}

async function removeRecentlyWornDuplicates(candidates: OutfitCandidate[]): Promise<OutfitCandidate[]> {
  const rows = await getAll<{ item_ids: string }>(
    "SELECT item_ids FROM outfits WHERE datetime(created_at) >= datetime('now', '-7 day');"
  );
  const recent = new Set(rows.map((r) => (JSON.parse(r.item_ids) as string[]).sort().join('|')));

  return candidates.filter((candidate) => {
    const key = [candidate.top.id, candidate.bottom.id, candidate.shoes?.id, candidate.accessory?.id, candidate.outerwear?.id]
      .filter((x): x is string => Boolean(x))
      .sort()
      .join('|');
    return !recent.has(key);
  });
}

export async function generateOutfits(
  occasion: string,
  closetItems: ClothingItem[],
  userProfile: UserProfile,
  tasteProfile: TasteProfile
): Promise<Outfit[]> {
  const layer1 = applyColorRules(filterByOccasion(closetItems, occasion));
  if (!layer1.length) {
    return [];
  }

  let layer2 = applySkinToneFilter(layer1, userProfile.skinToneId, userProfile.skinUndertone, 5);
  let layer3 = applyTasteFilter(layer2, tasteProfile, 4);

  if (layer3.length < 3) {
    layer3 = applyTasteFilter(layer2, tasteProfile, 2);
  }
  if (layer3.length < 3) {
    layer2 = applySkinToneFilter(layer1, userProfile.skinToneId, userProfile.skinUndertone, 3);
    layer3 = applyTasteFilter(layer2, tasteProfile, 2);
  }

  const layer4 = await applyGeminiLayer(layer3, userProfile, tasteProfile);
  const deduped = await removeRecentlyWornDuplicates(layer4.length ? layer4 : layer3);
  const bestPool = deduped.length ? deduped : (layer4.length ? layer4 : layer3);
  const best = bestPool
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 3);

  const outfits: Outfit[] = best.map((c) => ({
    id: `outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: generateOutfitName(occasion, c.layer1Score, c.layer2Score),
    occasion,
    itemIds: [c.top.id, c.bottom.id, c.shoes?.id, c.accessory?.id, c.outerwear?.id].filter((x): x is string => Boolean(x)),
    colorScore: c.layer1Score,
    skinScore: c.layer2Score,
    geminiScore: c.geminiScore,
    tasteScore: c.layer3Score,
    finalScore: c.finalScore || c.layer3Score,
    wornOn: null,
    liked: 0,
    createdAt: new Date().toISOString(),
    reasons: explainOutfitChoice(c, tasteProfile),
  }));

  if (tasteProfile.feedbackCount > 0 && tasteProfile.feedbackCount % 5 === 0) {
    await safeAsync(async () => recalculateTasteWeights(), 'Outfit.recalculateWeights');
  }

  return outfits;
}
