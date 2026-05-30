import { CATEGORY_BY_OCCASION } from '../constants/styleRules';
import { Outfit, OutfitCandidate, ClothingItem, TasteProfile, UserProfile, Undertone, TripPlan } from '../types/models';
import { getSeasonalPalette, colorSimilar, scoreColorHarmony, scoreOutfitProfessional, scoreSkinCompatibility } from './colorEngine';
import { validateWithGemini } from './gemini';
import { recalculateTasteWeights } from './feedbackEngine';
import { explainOutfitChoice, scoreCandidateAgainstTaste } from './tasteEngine';
import { safeAsync } from '../utils/safeAsync';
import { getAll } from '../db/queries';
import { requestLog } from './requestManager';
import { getSkinToneColors } from './skinToneEngine';

type SeasonMode = 'summer' | 'winter';

interface FilteredCloset {
  tops: ClothingItem[];
  bottoms: ClothingItem[];
  shoes: ClothingItem[];
  accessories: ClothingItem[];
}

interface GuaranteedCandidate {
  candidate: OutfitCandidate;
  items: ClothingItem[];
  rawScore: number;
}
export interface WeightVector { colorWeight: number; skinWeight: number; tasteWeight: number; geminiWeight: number; patternWeight: number; occasionWeight: number; }
export interface PersonalTasteModel { topColorFamilies: Array<{ family: string; score: number }>; avoidColorFamilies: Array<{ family: string; score: number }>; topPatterns: Array<{ pattern: string; score: number }>; blockedPatterns: string[]; }
interface OutfitScore { color: number; skin: number; taste: number; occasion: number; pattern: number; final: number; }

export const OCCASION_STYLE_MAP: Record<string, ClothingItem['styleType'][]> = {
  casual: ['casual', 'smart_casual', 'sports', 'party', 'professional', 'formal'],
  office: ['professional', 'formal', 'smart_casual', 'casual'],
  work: ['professional', 'formal', 'smart_casual', 'casual'],
  college: ['casual', 'smart_casual', 'sports', 'party', 'professional'],
  professional: ['professional', 'formal', 'smart_casual', 'casual'],
  formal: ['formal', 'professional', 'smart_casual'],
  party: ['party', 'casual', 'smart_casual', 'formal'],
  ethnic: ['ethnic', 'formal', 'party', 'casual'],
  gym: ['sports', 'casual'],
  sports: ['sports', 'casual'],
  date: ['party', 'smart_casual', 'casual', 'formal'],
  wedding: ['ethnic', 'formal', 'party'],
  festival: ['ethnic', 'party', 'casual'],
  travel: ['casual', 'smart_casual', 'sports'],
  default: ['casual', 'smart_casual', 'professional', 'formal', 'party', 'ethnic', 'sports'],
};

export function resolveOccasion(userInput: string): string {
  const s = userInput.toLowerCase().trim();
  if (OCCASION_STYLE_MAP[s]) return s;
  const entries = Object.entries({
    college: 'college', university: 'college', school: 'college', campus: 'college', class: 'college',
    office: 'office', work: 'office', meeting: 'office', interview: 'professional', presentation: 'professional',
    party: 'party', birthday: 'party', celebration: 'party', date: 'date', dinner: 'date', restaurant: 'date',
    wedding: 'wedding', festival: 'festival', puja: 'ethnic', temple: 'ethnic', function: 'ethnic',
    gym: 'gym', workout: 'gym', sports: 'sports', travel: 'travel', trip: 'travel', vacation: 'travel',
  });
  for (const [key, value] of entries) {
    if (s.includes(key)) return value;
  }
  return 'casual';
}

function getCurrentSeasonMode(): SeasonMode {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 8) return 'summer';
  return 'winter';
}

function matchesSeason(item: ClothingItem, season: string): boolean {
  const normalized = (item.season ?? 'all-season').toLowerCase();
  if (normalized === 'all-season') return true;
  if (season === 'summer') return normalized !== 'winter';
  return normalized !== 'summer';
}

function candidateItems(candidate: OutfitCandidate): ClothingItem[] {
  return [candidate.top, candidate.bottom, candidate.shoes, candidate.accessory, candidate.outerwear]
    .filter((x): x is ClothingItem => Boolean(x));
}

function outfitItemsKey(items: ClothingItem[]): string {
  return items.map((item) => item.id).sort().join('|');
}

function makeStableOutfitId(prefix: string, occasion: string, items: ClothingItem[]): string {
  const raw = `${prefix}:${occasion}:${outfitItemsKey(items)}`;
  return `${prefix}-${stableHash(raw)}`;
}

function stableHash(raw: string): string {
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function dedupeCandidates<T extends { items: ClothingItem[] }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = outfitItemsKey(entry.items);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCandidate(base: ClothingItem[]): OutfitCandidate | null {
  const top = base.find((i) => i.category === 'top');
  const bottom = base.find((i) => i.category === 'bottom');
  if (!top || !bottom) return null;

  return {
    top,
    bottom,
    shoes: base.find((i) => i.category === 'shoes') ?? null,
    accessory: base.find((i) => i.category === 'accessory') ?? null,
    outerwear: base.find((i) => i.category === 'outerwear') ?? null,
    layer1Score: 0,
    layer2Score: 0,
    layer3Score: 0,
    geminiScore: 0,
    finalScore: 0,
    reasons: [],
  };
}

function findBestColorMatch(items: ClothingItem[], existing: ClothingItem[]): ClothingItem {
  return items.reduce((best, item) => {
    const score = scoreColorHarmony([...existing, item]);
    const bestScore = scoreColorHarmony([...existing, best]);
    return score > bestScore ? item : best;
  }, items[0]);
}

function calculateRawScore(items: ClothingItem[]): number {
  const professional = scoreOutfitProfessional(items, 3, 'Neutral');
  return Math.max(1, Math.min(10, professional.colorHarmony * 0.7 + professional.sixtythirtyten * 0.3));
}

function filterForOccasion(items: ClothingItem[], occasion: string): FilteredCloset {
  const targetStyles = OCCASION_STYLE_MAP[resolveOccasion(occasion)] ?? OCCASION_STYLE_MAP.default;

  let tops = items.filter((i) => i.category === 'top' && targetStyles.includes(i.styleType));
  let bottoms = items.filter((i) => i.category === 'bottom' && targetStyles.includes(i.styleType));

  if (tops.length === 0 || bottoms.length === 0) {
    console.log('[Outfit] Relaxing style filter - using all items');
    tops = items.filter((i) => i.category === 'top');
    bottoms = items.filter((i) => i.category === 'bottom');
  }

  if (tops.length < 1) {
    tops = items.filter((i) => i.category === 'top' || i.category === 'outerwear');
  }

  const shoes = items.filter((i) => i.category === 'shoes');
  const accessories = items.filter((i) => i.category === 'accessory');

  console.log(`[Outfit] Filter result: ${tops.length} tops, ${bottoms.length} bottoms for occasion: ${occasion}`);

  return { tops, bottoms, shoes, accessories };
}

export function filterClosetForOccasion(items: ClothingItem[], occasion: string): FilteredCloset {
  return filterForOccasion(items, occasion);
}

function buildGuaranteedOutfits(filtered: FilteredCloset, userProfile: UserProfile, count = 3): GuaranteedCandidate[] {
  const { tops, bottoms, shoes, accessories } = filtered;

  if (tops.length === 0 || bottoms.length === 0) {
    return [];
  }

  console.log(`OutfitEngine: building combinations from ${tops.length} tops and ${bottoms.length} bottoms`);

  const candidates: GuaranteedCandidate[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      const outfitItems: ClothingItem[] = [top, bottom];

      if (shoes.length > 0) {
        outfitItems.push(findBestColorMatch(shoes, outfitItems));
      }

      if (accessories.length > 0 && (['formal', 'party', 'professional'].includes(top.styleType) || outfitItems.every((item) => item.pattern === 'solid'))) {
        outfitItems.push(findBestColorMatch(accessories, outfitItems));
      }

      const candidate = buildCandidate(outfitItems);
      if (!candidate) continue;

      const rawScore = Math.max(1, Math.min(10, calculateRawScore(outfitItems)));
      candidate.layer1Score = rawScore;
      candidate.layer2Score = scoreSkinCompatibility(outfitItems, userProfile.skinToneId, userProfile.skinUndertone);
      candidates.push({ candidate, items: outfitItems, rawScore });
    }
  }

  const sorted = dedupeCandidates(candidates).sort((a, b) => b.rawScore - a.rawScore);
  const top = sorted.slice(0, Math.min(sorted.length, count));

  return top;
}

export function filterByOccasion(items: ClothingItem[], occasion: string): ClothingItem[] {
  const allowed = CATEGORY_BY_OCCASION[occasion] ?? CATEGORY_BY_OCCASION.casual;
  const byOccasion = items.filter((i) => allowed.includes(i.styleType));
  if (items.length < 10) return byOccasion;
  const seasonMode = getCurrentSeasonMode();
  const seasonFiltered = byOccasion.filter((item) => matchesSeason(item, seasonMode));

  const seasonTops = seasonFiltered.filter((i) => i.category === 'top').length;
  const seasonBottoms = seasonFiltered.filter((i) => i.category === 'bottom').length;

  if (seasonTops < 1 || seasonBottoms < 1) {
    return byOccasion;
  }

  return seasonFiltered.length ? seasonFiltered : byOccasion;
}

export function findBestMatch(items: ClothingItem[], existing: ClothingItem[]): ClothingItem | null {
  if (!items.length) return null;

  return items.reduce((best, item) => {
    const score = scoreColorHarmony([...existing, item]);
    const bestScore = scoreColorHarmony([...existing, best]);
    return score > bestScore ? item : best;
  });
}

function findBestAccessory(items: ClothingItem[], existing: ClothingItem[], occasion: string): ClothingItem | null {
  if (!items.length) return null;

  const shouldUseAccessory = occasion === 'formal' || occasion === 'party' || occasion === 'professional'
    || existing.every((x) => (x.pattern ?? 'solid') === 'solid');

  if (!shouldUseAccessory) return null;
  return findBestMatch(items, existing);
}

export function buildCombinations(closet: ClothingItem[], occasion: string, season: string): OutfitCandidate[] {
  const applySeason = closet.length >= 10;
  const tops = closet.filter((i) => i.category === 'top' && (!applySeason || matchesSeason(i, season)));
  const bottoms = closet.filter((i) => i.category === 'bottom' && (!applySeason || matchesSeason(i, season)));
  const shoes = closet.filter((i) => i.category === 'shoes');
  const accessories = closet.filter((i) => i.category === 'accessory');
  const outerwear = closet.filter((i) => i.category === 'outerwear');

  if (!tops.length || !bottoms.length) return [];

  const candidates: OutfitCandidate[] = [];

  for (const top of tops.slice(0, 10)) {
    for (const bottom of bottoms.slice(0, 10)) {
      const base: ClothingItem[] = [top, bottom];

      const bestShoe = findBestMatch(shoes, base);
      if (bestShoe) base.push(bestShoe);

      const bestAccessory = findBestAccessory(accessories, base, occasion);
      if (bestAccessory) base.push(bestAccessory);

      if (season === 'winter' || occasion === 'formal') {
        const bestOuter = findBestMatch(outerwear, base);
        if (bestOuter) base.push(bestOuter);
      }

      const candidate = buildCandidate(base);
      if (candidate) {
        const professional = scoreOutfitProfessional(base, 3, 'neutral');
        candidate.layer1Score = Math.max(1, Math.min(10, professional.colorHarmony * 0.7 + professional.sixtythirtyten * 0.3));
        candidates.push(candidate);
      }

      if (candidates.length >= 50) break;
    }
    if (candidates.length >= 50) break;
  }

  return candidates;
}

function getHarmonyType(items: ClothingItem[]): string {
  if (items.length < 2) return 'Cohesive';
  const harmony = scoreColorHarmony(items);
  if (harmony >= 9) return 'Complementary';
  if (harmony >= 8) return 'Analogous';
  if (harmony >= 7) return 'Triadic';
  return 'Balanced';
}

function getOccasionExplanation(items: ClothingItem[], occasion: string): string {
  const styleTypes = items.map((i) => i.styleType.toLowerCase());
  const hasFormal = styleTypes.some((x) => ['formal', 'professional', 'classic', 'tailored'].includes(x));
  if ((occasion === 'formal' || occasion === 'professional') && hasFormal) {
    return 'Structured pieces align with your formal setting';
  }
  if (occasion === 'party') {
    return 'Statement-ready mix keeps the outfit event appropriate';
  }
  return 'Relaxed structure keeps this suitable for the occasion';
}

function getPatternNote(items: ClothingItem[]): string | null {
  const boldPatterns = items
    .map((i) => (i.pattern ?? '').toLowerCase())
    .filter((p) => ['stripes', 'checks', 'floral', 'print'].includes(p));

  if (!boldPatterns.length) return 'Solid foundation keeps the look clean and elevated';
  if (boldPatterns.length === 1) return 'Single statement pattern adds focus without clutter';
  if (boldPatterns.length === 2) return 'Dual pattern mix is balanced with controlled color harmony';
  return null;
}

export function getSkinToneExplanation(items: ClothingItem[], toneId: number, undertone: string): string {
  const palette = getSkinToneColors(toneId, undertone as Undertone);
  const excellentCount = items.filter((i) => palette.excellentColors.some((c) => colorSimilar(i.colorHex, c))).length;

  if (excellentCount >= 2) return `${excellentCount} items from your perfect color palette`;
  if (excellentCount === 1) return 'Key piece selected for your skin tone specifically';
  return 'Neutral palette works safely with your complexion';
}

export function generateOutfitExplanation(outfit: OutfitCandidate, toneId: number, undertone: string, occasion: string): string[] {
  const items = candidateItems(outfit);
  const explanations: string[] = [];
  const season = getSeasonalPalette(toneId, undertone);

  const harmonyType = getHarmonyType(items);
  explanations.push(`${harmonyType} color palette - professionally balanced`);

  const skinExplanation = getSkinToneExplanation(items, toneId, undertone);
  if (skinExplanation) explanations.push(skinExplanation);

  explanations.push(getOccasionExplanation(items, occasion));

  const patternNote = getPatternNote(items);
  if (patternNote) explanations.push(patternNote);

  explanations.push(`${season} palette - suits your undertone perfectly`);

  return explanations.slice(0, 5);
}

function getDominantColorFamily(items: ClothingItem[]): 'warm' | 'cool' | 'neutral' {
  if (!items.length) return 'neutral';
  const warm = ['red', 'orange', 'yellow', 'brown', 'gold'];
  const cool = ['blue', 'green', 'purple', 'teal', 'navy'];
  const names = items.map((i) => i.colorHex.toLowerCase());
  const warmCount = names.filter((n) => warm.some((token) => n.includes(token))).length;
  const coolCount = names.filter((n) => cool.some((token) => n.includes(token))).length;
  if (warmCount > coolCount) return 'warm';
  if (coolCount > warmCount) return 'cool';
  return 'neutral';
}

export function generateOutfitName(a: string | OutfitCandidate, b: number | string, c?: number): string {
  if (typeof a === 'string') {
    const occasion = a;
    const colorScore = Number(b);
    const skinScore = c ?? 7;
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

    if (skinScore >= 8) return `${base} - Especially Flattering For Your Tone`;
    return base;
  }

  const outfit = a;
  const occasion = (b as string) ?? 'casual';
  const score = c ?? outfit.finalScore ?? 7;
  const colorFamily = getDominantColorFamily(candidateItems(outfit));

  const vibeMap: Record<string, string[]> = {
    casual: ['Effortless ', 'Relaxed ', 'Weekend ', 'Easy '],
    formal: ['Sharp ', 'Polished ', 'Refined ', 'Crisp '],
    party: ['Bold ', 'Statement ', 'Night ', 'Electric '],
    ethnic: ['Elegant ', 'Heritage ', 'Cultural ', 'Regal '],
    professional: ['Confident ', 'Executive ', 'Power ', 'Structured '],
  };

  const styleMap: Record<'warm' | 'cool' | 'neutral', string[]> = {
    warm: ['Earth Tone', 'Golden Hour', 'Autumn Edit', 'Warm Edit'],
    cool: ['Cool Tone', 'Blue Hour', 'Winter Edit', 'Minimal'],
    neutral: ['Tonal Edit', 'Monochrome', 'Classic Edit', 'Modern'],
  };

  const vibes = vibeMap[occasion] ?? vibeMap.casual;
  const styles = styleMap[colorFamily];
  const seed = Number.parseInt(stableHash(`${occasion}:${score}:${candidateItems(outfit).map((item) => item.id).join('|')}`).slice(0, 4), 36);
  const vibe = vibes[seed % vibes.length] ?? '';
  const style = styles[(seed + 1) % styles.length] ?? 'Look';
  const suffix = score >= 8.5 ? ' Select' : '';

  return `${vibe}${style}${suffix}`;
}

export function applyColorRules(items: ClothingItem[]): OutfitCandidate[] {
  return buildCombinations(items, 'casual', getCurrentSeasonMode());
}

export function applySkinToneFilter(candidates: OutfitCandidate[], toneId: number, undertone: Undertone, threshold = 5): OutfitCandidate[] {
  return candidates
    .map((candidate) => {
      const profile = scoreOutfitProfessional(candidateItems(candidate), toneId, undertone);
      const combined = profile.skinCompatibility * 0.65 + profile.contrastBalance * 0.35;
      return { ...candidate, layer2Score: combined };
    })
    .filter((candidate) => candidate.layer2Score >= threshold)
    .sort((a, b) => b.layer2Score - a.layer2Score);
}

export function applyTasteFilter(candidates: OutfitCandidate[], tasteProfile: TasteProfile, threshold = 4): OutfitCandidate[] {
  const scored = candidates
    .map((candidate) => ({ ...candidate, layer3Score: scoreCandidateAgainstTaste(candidate, tasteProfile) }))
    .filter((candidate) => candidate.layer3Score >= threshold)
    .filter((candidate) => {
      const patterns = [candidate.top.pattern, candidate.bottom.pattern, candidate.shoes?.pattern, candidate.accessory?.pattern]
        .filter((x): x is ClothingItem['pattern'] => Boolean(x));
      const blocked = patterns.some((pattern) => tasteProfile.blockedPatterns.includes(pattern));
      return !blocked;
    })
    .sort((a, b) => b.layer3Score - a.layer3Score);

  const withoutDislikedColors = scored.filter((candidate) => ![
    candidate.top.colorHex,
    candidate.bottom.colorHex,
    candidate.shoes?.colorHex,
    candidate.accessory?.colorHex,
  ]
    .filter((x): x is string => Boolean(x))
    .some((hex) => tasteProfile.dislikedColors.includes(hex)));

  return withoutDislikedColors.length ? withoutDislikedColors : scored;
}

function calculateFinalScores(candidates: OutfitCandidate[]): OutfitCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    finalScore: candidate.layer1Score * 0.2 + candidate.layer2Score * 0.25 + candidate.layer3Score * 0.3 + candidate.geminiScore * 0.25,
  }));
}

async function applyGeminiLayer(candidates: OutfitCandidate[], user: UserProfile, tasteProfile: TasteProfile): Promise<OutfitCandidate[]> {
  const recentCalls = requestLog.filter((r) => !r.cacheHit && Date.now() - r.time < 60000).length;
  if (recentCalls >= 12) {
    console.log('[Outfit] Skipping Gemini, using Layer 3 scores');
    const withBaseGemini = candidates.map((candidate) => ({ ...candidate, geminiScore: 7 }));
    return calculateFinalScores(withBaseGemini);
  }

  const top6 = candidates.slice(0, 6);
  const { data: ratings, error } = await safeAsync(
    async () => validateWithGemini(top6, `Tone ${user.skinToneId}`, user.skinUndertone, tasteProfile.styleIdentity, 'neutral', `${tasteProfile.patternTolerance}`),
    'Outfit.applyGeminiLayer'
  );

  if (error || !ratings) {
    return top6.map((candidate) => ({
      ...candidate,
      geminiScore: 0,
      finalScore: candidate.layer3Score,
      reasons: [...candidate.reasons, 'AI validation unavailable'],
    }));
  }

  const rated = top6
    .map((candidate, index) => {
      const match = ratings.find((rating) => rating.index === index);
      return {
        ...candidate,
        geminiScore: match?.score ?? 0,
        reasons: match?.reason ? [...candidate.reasons, match.reason] : candidate.reasons,
      };
    })
    .filter((candidate) => candidate.geminiScore >= 7);

  const finalCandidates = rated.length ? rated : top6;
  return calculateFinalScores(finalCandidates);
}

async function getRecentOutfits(days: number): Promise<Array<{ item_ids: string }>> {
  return getAll<{ item_ids: string }>(
    'SELECT item_ids FROM outfits WHERE datetime(created_at) >= datetime(?, ?);',
    ['now', `-${days} day`]
  );
}

export async function filterRecentOutfits(candidates: OutfitCandidate[]): Promise<OutfitCandidate[]> {
  const recentOutfits = await getRecentOutfits(7);
  const recentItemSets = recentOutfits.map((outfit) => (JSON.parse(outfit.item_ids) as string[]).sort().join(','));

  return candidates.filter((candidate) => {
    const itemSet = candidateItems(candidate).map((item) => item.id).sort().join(',');
    return !recentItemSets.includes(itemSet);
  });
}

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function scoreOccasionFit(items: ClothingItem[], occasion: string): number {
  const allowed = OCCASION_STYLE_MAP[resolveOccasion(occasion)] ?? OCCASION_STYLE_MAP.default;
  const matched = items.filter((i) => allowed.includes(i.styleType)).length;
  return clamp((matched / Math.max(items.length, 1)) * 10, 1, 10);
}
function scorePatternMix(items: ClothingItem[]): number {
  const bold = items.filter((i) => ['stripes', 'checks', 'floral', 'print', 'geometric', 'abstract'].includes(i.pattern)).length;
  return bold <= 1 ? 9 : bold === 2 ? 7 : 5;
}
function scoreAgainstPersonalModel(items: ClothingItem[], model: PersonalTasteModel): number {
  let score = 5;
  items.forEach((item) => {
    const loved = model.topColorFamilies.find((c) => c.family === item.colorFamily);
    if (loved) score += loved.score * 1.5;
    const avoided = model.avoidColorFamilies.find((c) => c.family === item.colorFamily);
    if (avoided) score -= avoided.score * 2;
    if (model.blockedPatterns.includes(item.pattern)) score -= 3;
    const likedPattern = model.topPatterns.find((p) => p.pattern === item.pattern);
    if (likedPattern) score += likedPattern.score * 0.5;
  });
  return clamp(score, 1, 10);
}
export function scoreOutfitComplete(items: ClothingItem[], toneId: number, undertone: string, tasteModel: PersonalTasteModel, weights: WeightVector, occasion: string): OutfitScore {
  const colorScore = scoreColorHarmony(items);
  const skinScore = scoreSkinCompatibility(items, toneId, undertone as Undertone);
  const tasteScore = scoreAgainstPersonalModel(items, tasteModel);
  const occasionScore = scoreOccasionFit(items, occasion);
  const patternScore = scorePatternMix(items);
  const final = colorScore * weights.colorWeight + skinScore * weights.skinWeight + tasteScore * weights.tasteWeight + occasionScore * weights.occasionWeight + patternScore * weights.patternWeight;
  return { color: Math.round(colorScore * 10) / 10, skin: Math.round(skinScore * 10) / 10, taste: Math.round(tasteScore * 10) / 10, occasion: Math.round(occasionScore * 10) / 10, pattern: Math.round(patternScore * 10) / 10, final: Math.round(final * 10) / 10 };
}

export async function generateOutfitsProduction(occasionInput: string, closet: ClothingItem[], userProfile: UserProfile, tasteModel: PersonalTasteModel, weights: WeightVector): Promise<Outfit[]> {
  if (!closet.length) return [];
  const occasion = resolveOccasion(occasionInput);
  const filtered = filterClosetForOccasion(closet, occasionInput);
  const candidates: Array<{ items: ClothingItem[]; score: OutfitScore }> = [];
  for (const top of filtered.tops.slice(0, 10)) {
    for (const bottom of filtered.bottoms.slice(0, 10)) {
      const items: ClothingItem[] = [top, bottom];
      if (filtered.shoes.length) items.push(findBestColorMatch(filtered.shoes, items));
      if (filtered.accessories.length) items.push(findBestColorMatch(filtered.accessories, items));
      candidates.push({ items, score: scoreOutfitComplete(items, userProfile.skinToneId, userProfile.skinUndertone, tasteModel, weights, occasion) });
      if (candidates.length >= 50) break;
    }
    if (candidates.length >= 50) break;
  }
  const ranked = dedupeCandidates(candidates).sort((a, b) => b.score.final - a.score.final).slice(0, 3);
  return ranked.map((c) => {
    const candidate = buildCandidate(c.items);
    return {
      id: makeStableOutfitId('production', occasion, c.items),
      name: generateOutfitName(occasion, c.score.color, c.score.skin),
      occasion,
      itemIds: c.items.map((i) => i.id),
      colorScore: c.score.color * 10,
      skinScore: c.score.skin * 10,
      geminiScore: 7,
      tasteScore: c.score.taste * 10,
      finalScore: c.score.final * 10,
      wornOn: null,
      liked: 0,
      createdAt: new Date().toISOString(),
      reasons: candidate ? generateOutfitExplanation(candidate, userProfile.skinToneId, userProfile.skinUndertone, occasion).slice(0, 4) : [],
    };
  });
}

export async function generateOutfits(
  occasion: string,
  closetItems: ClothingItem[],
  userProfile: UserProfile,
  tasteProfile: TasteProfile
): Promise<Outfit[]> {
  if (!closetItems.length) {
    return [];
  }

  const totalItems = closetItems.length;
  const topCount = closetItems.filter((item) => item.category === 'top').length;
  const bottomCount = closetItems.filter((item) => item.category === 'bottom').length;
  const shoeCount = closetItems.filter((item) => item.category === 'shoes').length;
  const uniqueStyles = Array.from(new Set(closetItems.map((item) => item.styleType))).sort();
  const uniqueCategories = Array.from(new Set(closetItems.map((item) => item.category))).sort();
  console.log(`OutfitEngine: closet has ${totalItems} items total`);
  console.log(`OutfitEngine: tops = ${topCount}, bottoms = ${bottomCount}, shoes = ${shoeCount}`);
  console.log(`OutfitEngine: style_types in closet = [${uniqueStyles.join(', ')}]`);
  console.log(`OutfitEngine: categories in closet = [${uniqueCategories.join(', ')}]`);

  if (topCount < 1 || bottomCount < 1) {
    console.log('[Outfit] Cannot generate a complete outfit without at least one top and one bottom.');
    return [];
  }

  const resolvedOccasion = resolveOccasion(occasion);
  const filtered = filterForOccasion(closetItems, resolvedOccasion);
  const filteredItems = [...filtered.tops, ...filtered.bottoms, ...filtered.shoes, ...filtered.accessories];
  const filteredTotal = filteredItems.length;
  const filteredDetail = filteredItems.map((item) => `${item.id}:${item.styleType}`);
  console.log(`OutfitEngine: after occasion filter = ${filteredTotal} items`);
  console.log(`OutfitEngine: filtered items = [${filteredDetail.join(', ')}]`);
  let candidates = buildGuaranteedOutfits(filtered, userProfile, 5);

  const fallbackTriggered = candidates.length < 3;
  console.log(`OutfitEngine: fallback triggered = ${fallbackTriggered}`);

  if (candidates.length < 3) {
    const allItems: FilteredCloset = {
      tops: closetItems.filter((i) => i.category === 'top'),
      bottoms: closetItems.filter((i) => i.category === 'bottom'),
      shoes: closetItems.filter((i) => i.category === 'shoes'),
      accessories: closetItems.filter((i) => i.category === 'accessory'),
    };
    candidates = buildGuaranteedOutfits(allItems, userProfile, 5);
  }

  const ranked = candidates
    .map((c) => {
      const tasteScore = scoreCandidateAgainstTaste(c.candidate, tasteProfile);
      const skinScore = scoreSkinCompatibility(c.items, userProfile.skinToneId, userProfile.skinUndertone);
      const finalScore = (c.rawScore * 0.3) + (tasteScore * 0.4) + (skinScore * 0.3);
      const candidate = {
        ...c.candidate,
        layer1Score: c.rawScore,
        layer2Score: skinScore,
        layer3Score: tasteScore,
        geminiScore: 7,
        finalScore,
      };

      return {
        candidate,
        items: c.items,
        rawScore: c.rawScore,
        tasteScore,
        skinScore,
        finalScore,
        geminiScore: 7,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  const topCandidates = ranked.slice(0, 6).map((entry) => entry.candidate);
  if (topCandidates.length) {
    const { data: ratings, error } = await safeAsync(
      async () => validateWithGemini(
        topCandidates,
        `Tone ${userProfile.skinToneId}`,
        userProfile.skinUndertone,
        tasteProfile.styleIdentity,
        'neutral',
        `${tasteProfile.patternTolerance}`
      ),
      'Outfit.validateWithGemini'
    );

    if (error || !ratings) {
      console.log('[Outfit] Gemini validation skipped:', error ?? 'unknown error');
      ranked.forEach((entry) => {
        entry.candidate.geminiScore = 7;
        entry.geminiScore = 7;
      });
    } else {
      ratings.forEach((rating) => {
        const entry = ranked[rating.index];
        if (entry) {
          entry.candidate.geminiScore = rating.score;
          entry.geminiScore = rating.score;
          entry.finalScore = (entry.rawScore * 0.25) + (entry.tasteScore * 0.3) + (entry.skinScore * 0.25) + (entry.geminiScore * 0.2);
          entry.candidate.finalScore = entry.finalScore;
          entry.candidate.reasons = rating.reason ? [...entry.candidate.reasons, rating.reason] : entry.candidate.reasons;
        }
      });
    }
  }

  const baseThreshold = 6;
  const reranked = dedupeCandidates(ranked).sort((a, b) => b.finalScore - a.finalScore);
  let filteredByScore = reranked.filter((entry) => entry.finalScore >= baseThreshold);
  if (!filteredByScore.length) {
    const loweredThreshold = baseThreshold * 0.7;
    filteredByScore = reranked.filter((entry) => entry.finalScore >= loweredThreshold);
  }
  const rankedPool = filteredByScore.length ? filteredByScore : reranked;
  const results = rankedPool.slice(0, 3);

  if (results.length === 0 && closetItems.length > 0) {
    const top = closetItems.find((item) => item.category === 'top');
    const bottom = closetItems.find((item) => item.category === 'bottom');
    if (top && bottom) {
      const fallback = buildCandidate([top, bottom]);
      if (fallback) {
        results.push({
          candidate: fallback,
          items: [top, bottom],
          rawScore: 6,
          tasteScore: 6,
          skinScore: 6,
          finalScore: 6,
          geminiScore: 7,
        });
      }
    }
  }

  const outfits: Outfit[] = results.map((entry) => ({
    id: makeStableOutfitId('outfit', resolvedOccasion, entry.items),
    name: generateOutfitName(entry.candidate, resolvedOccasion, entry.finalScore),
    occasion: resolvedOccasion,
    itemIds: entry.items.map((item) => item.id),
    colorScore: Math.round(entry.rawScore * 10),
    skinScore: Math.round(entry.skinScore * 10),
    geminiScore: Math.round(entry.geminiScore),
    tasteScore: Math.round(entry.tasteScore * 10),
    finalScore: Math.round(entry.finalScore * 10),
    wornOn: null,
    liked: 0,
    createdAt: new Date().toISOString(),
    reasons: [
      `Confidence ${Math.round(entry.finalScore * 10)}% based on closet match, color harmony, occasion fit, and taste feedback`,
      ...generateOutfitExplanation(entry.candidate, userProfile.skinToneId, userProfile.skinUndertone, resolvedOccasion),
      ...entry.candidate.reasons,
      ...explainOutfitChoice(entry.candidate, tasteProfile),
    ].slice(0, 5),
  }));

  if (tasteProfile.feedbackCount > 0 && tasteProfile.feedbackCount % 5 === 0) {
    await safeAsync(async () => recalculateTasteWeights(), 'Outfit.recalculateWeights');
  }

  console.log(`OutfitEngine: final outfit count = ${outfits.length}`);

  return outfits;
}

export function generateFallbackOutfits(closet: ClothingItem[], count = 3): Outfit[] {
  const tops = closet.filter(i => i.category === 'top');
  const bottoms = closet.filter(i => i.category === 'bottom');
  const shoes = closet.filter(i => i.category === 'shoes');
  if (!tops.length || !bottoms.length) return [];

  const results: Outfit[] = [];
  for (let i = 0; i < count; i++) {
    const top = tops[i % tops.length];
    const bottom = bottoms[i % bottoms.length];
    const shoe = shoes[i % shoes.length] || null;
    const items: ClothingItem[] = [top, bottom];
    if (shoe) items.push(shoe);

    const outfit: Outfit = {
      id: makeStableOutfitId('fallback', 'casual', items),
      name: `Simple ${top.colorFamily || 'Neutral'} Combination`,
      occasion: 'casual',
      itemIds: items.map(it => it.id),
      colorScore: 70,
      skinScore: 70,
      geminiScore: 7,
      tasteScore: 70,
      finalScore: 70,
      wornOn: null,
      liked: 0,
      createdAt: new Date().toISOString(),
      reasons: ['Quick matching fallback combination'],
    };
    results.push(outfit);
  }
  return results;
}

function generateBasicOutfits(closet: ClothingItem[], occasion = 'casual', count = 3): Outfit[] {
  const tops = closet.filter((i) => i.category === 'top');
  const bottoms = closet.filter((i) => i.category === 'bottom');
  const shoes = closet.filter((i) => i.category === 'shoes');
  if (!tops.length || !bottoms.length) return [];

  const results: Outfit[] = [];
  for (let i = 0; i < count; i += 1) {
    const top = tops[i % tops.length];
    const bottom = bottoms[i % bottoms.length];
    const items: ClothingItem[] = [top, bottom];
    if (shoes.length) items.push(shoes[i % shoes.length]);

    results.push({
      id: makeStableOutfitId('basic', occasion, items),
      name: generateOutfitName(occasion, 7, 7),
      occasion,
      itemIds: items.map((item) => item.id),
      colorScore: 70,
      skinScore: 70,
      geminiScore: 7,
      tasteScore: 70,
      finalScore: 70,
      wornOn: null,
      liked: 0,
      createdAt: new Date().toISOString(),
      reasons: ['Basic top and bottom pairing'],
    });
  }

  return results;
}

export async function safeGenerateOutfits(
  occasion: string,
  closetItems: ClothingItem[],
  userProfile: UserProfile,
  tasteProfile: TasteProfile
): Promise<Outfit[]> {
  try {
    return await generateOutfits(occasion, closetItems, userProfile, tasteProfile);
  } catch {
    return generateBasicOutfits(closetItems, resolveOccasion(occasion));
  }
}

export async function generateGuaranteed(
  occasionInput: string,
  closet: ClothingItem[],
  profile: UserProfile,
  taste: TasteProfile
): Promise<Outfit[]> {
  const outfits = await generateOutfits(occasionInput, closet, profile, taste);
  if (outfits.length >= 3) return outfits;

  const fallback = generateFallbackOutfits(closet, 3 - outfits.length);
  return [...outfits, ...fallback].slice(0, 3);
}

function makeOutfit(items: ClothingItem[], occasion = 'casual'): Outfit {
  const finalScore = Math.round(calculateRawScore(items) * 10);
  return {
    id: makeStableOutfitId('build', occasion, items),
    name: 'Built Around Your Pick',
    occasion,
    itemIds: items.map((i) => i.id),
    colorScore: finalScore,
    skinScore: finalScore,
    geminiScore: Math.round(finalScore / 10),
    tasteScore: finalScore,
    finalScore,
    wornOn: null,
    liked: 0,
    createdAt: new Date().toISOString(),
    reasons: ['Built around your selected item'],
  };
}

export async function buildAroundItem(
  anchorItem: ClothingItem,
  closet: ClothingItem[],
  occasion: string,
  _userProfile: UserProfile,
  _tasteProfile: TasteProfile
): Promise<Outfit[]> {
  const scoped = filterByOccasion(closet, resolveOccasion(occasion));
  const others = scoped.filter((i) => i.id !== anchorItem.id);
  const tops = others.filter((i) => i.category === 'top');
  const bottoms = others.filter((i) => i.category === 'bottom');
  const shoes = others.filter((i) => i.category === 'shoes');
  const accessories = others.filter((i) => i.category === 'accessory');
  const candidates: Outfit[] = [];
  if (anchorItem.category === 'top') {
    for (const bottom of bottoms.slice(0, 8)) {
      const items = [anchorItem, bottom];
      if (shoes.length > 0) items.push(findBestColorMatch(shoes, items));
      if (accessories.length > 0) items.push(findBestColorMatch(accessories, items));
      candidates.push(makeOutfit(items, occasion));
    }
  } else if (anchorItem.category === 'bottom') {
    for (const top of tops.slice(0, 8)) {
      const items = [top, anchorItem];
      if (shoes.length > 0) items.push(findBestColorMatch(shoes, items));
      if (accessories.length > 0) items.push(findBestColorMatch(accessories, items));
      candidates.push(makeOutfit(items, occasion));
    }
  } else {
    for (const top of tops.slice(0, 6)) {
      for (const bottom of bottoms.slice(0, 6)) {
        const items = [top, bottom, anchorItem];
        if (shoes.length > 0 && anchorItem.category !== 'shoes') items.push(findBestColorMatch(shoes, items));
        candidates.push(makeOutfit(items, occasion));
      }
    }
  }
  return candidates.sort((a, b) => b.finalScore - a.finalScore).slice(0, 3);
}

export async function generateTripOutfits(
  days: number,
  occasion: string,
  closet: ClothingItem[],
  userProfile: UserProfile,
  tasteProfile: TasteProfile
): Promise<TripPlan> {
  const outfits: Outfit[] = [];
  const usedItemIds = new Set<string>();
  for (let day = 0; day < days; day += 1) {
    const available = closet.filter((i) => !usedItemIds.has(i.id) || closet.length < days * 2);
    const dayOutfits = await generateGuaranteed(occasion, available, userProfile, tasteProfile);
    if (dayOutfits.length > 0) {
      const outfit = dayOutfits[0];
      outfits.push({ ...outfit, day: day + 1 });
      outfit.itemIds.forEach((id) => usedItemIds.add(id));
    }
  }
  const unique = [...new Map(outfits.flatMap((o) => o.itemIds).map((id) => [id, closet.find((c) => c.id === id)])).values()]
    .filter((i): i is ClothingItem => Boolean(i));
  return { outfits, packingList: unique, totalItems: unique.length, daysPlanned: outfits.length };
}
