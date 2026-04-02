import { CATEGORY_BY_OCCASION } from '../constants/styleRules';
import { Outfit, OutfitCandidate, ClothingItem, TasteProfile, UserProfile, Undertone } from '../types/models';
import { getSeasonalPalette, colorSimilar, scoreColorHarmony, scoreOutfitProfessional, scoreSkinCompatibility } from './colorEngine';
import { validateWithGemini } from './gemini';
import { recalculateTasteWeights } from './feedbackEngine';
import { explainOutfitChoice, scoreCandidateAgainstTaste } from './tasteEngine';
import { safeAsync } from '../utils/safeAsync';
import { getAll } from '../db/queries';
import { managedRequest, requestLog } from './requestManager';
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

export const OCCASION_MAP: Record<string, string> = {
  college: 'casual', university: 'casual', school: 'casual',
  class: 'casual', campus: 'casual', lecture: 'casual',

  office: 'professional', work: 'professional', meeting: 'professional',
  interview: 'professional', presentation: 'professional',

  party: 'party', birthday: 'party', celebration: 'party',
  date: 'party', dinner: 'smart_casual', lunch: 'casual',

  wedding: 'ethnic', festival: 'ethnic', puja: 'ethnic',
  diwali: 'ethnic', eid: 'ethnic', function: 'ethnic',

  gym: 'sports', workout: 'sports', sports: 'sports',

  casual: 'casual', formal: 'formal', everyday: 'casual',
  outing: 'casual', shopping: 'casual', travel: 'casual',
};

export function resolveOccasion(userInput: string): string {
  const lower = userInput.toLowerCase();
  if (OCCASION_MAP[lower]) return OCCASION_MAP[lower];
  for (const [key, value] of Object.entries(OCCASION_MAP)) {
    if (lower.includes(key)) return value;
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

function createPlaceholderItem(category: 'top' | 'bottom'): ClothingItem {
  return {
    id: `placeholder-${category}`,
    imagePath: '',
    category,
    subcategory: `${category}-placeholder`,
    colorHsl: 'hsl(0,0%,50%)',
    colorHex: '#808080',
    colorFamily: 'neutral',
    pattern: 'solid',
    styleType: 'casual',
    fitType: 'regular',
    season: 'all-season',
    userCorrected: 0,
    aiConfidence: 0,
    aiRawLabel: 'placeholder',
    timesWorn: 0,
    lastWorn: null,
    createdAt: new Date().toISOString(),
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
  const occasionStyleMap: Record<string, ClothingItem['styleType'][]> = {
    college: ['casual', 'smart_casual', 'sports'],
    casual: ['casual', 'smart_casual', 'sports', 'party'],
    office: ['professional', 'formal', 'smart_casual', 'casual'],
    formal: ['formal', 'professional', 'smart_casual'],
    party: ['party', 'casual', 'smart_casual', 'formal'],
    ethnic: ['ethnic', 'formal', 'party'],
    professional: ['professional', 'formal', 'smart_casual'],
    gym: ['sports', 'casual'],
    default: ['casual', 'smart_casual', 'professional', 'formal', 'party', 'ethnic', 'sports'],
  };

  const normalizedOccasion = occasion.toLowerCase();
  const targetStyles = occasionStyleMap[normalizedOccasion] ?? occasionStyleMap.default;

  let tops = items.filter((i) => i.category === 'top' && targetStyles.includes(i.styleType));
  let bottoms = items.filter((i) => i.category === 'bottom' && targetStyles.includes(i.styleType));

  if (tops.length < 2 || bottoms.length < 2) {
    tops = items.filter((i) => i.category === 'top');
    bottoms = items.filter((i) => i.category === 'bottom');
  }

  if (tops.length < 1) {
    tops = items.filter((i) => i.category === 'top' || i.category === 'outerwear');
  }

  const shoes = items.filter((i) => i.category === 'shoes');
  const accessories = items.filter((i) => i.category === 'accessory');

  return { tops, bottoms, shoes, accessories };
}

function buildSingleItemOutfits(shoes: ClothingItem[], accessories: ClothingItem[], count: number): GuaranteedCandidate[] {
  const candidates: GuaranteedCandidate[] = [];
  const top = createPlaceholderItem('top');
  const bottom = createPlaceholderItem('bottom');

  for (let i = 0; i < Math.max(1, count); i += 1) {
    const items: ClothingItem[] = [top, bottom];
    if (shoes.length) {
      items.push(shoes[i % shoes.length]);
    }
    if (accessories.length) {
      items.push(accessories[i % accessories.length]);
    }
    const candidate = buildCandidate(items);
    if (!candidate) continue;
    candidates.push({
      candidate,
      items,
      rawScore: calculateRawScore(items),
    });
  }

  return candidates;
}

function buildGuaranteedOutfits(filtered: FilteredCloset, userProfile: UserProfile, count = 3): GuaranteedCandidate[] {
  const { tops, bottoms, shoes, accessories } = filtered;

  if (tops.length === 0 && bottoms.length === 0) {
    return buildSingleItemOutfits(shoes, accessories, count);
  }

  const effectiveTops = tops.length > 0 ? tops : [createPlaceholderItem('top')];
  const effectiveBottoms = bottoms.length > 0 ? bottoms : [createPlaceholderItem('bottom')];

  const candidates: GuaranteedCandidate[] = [];

  for (const top of effectiveTops) {
    for (const bottom of effectiveBottoms) {
      const outfitItems: ClothingItem[] = [top, bottom];

      if (shoes.length > 0) {
        outfitItems.push(findBestColorMatch(shoes, outfitItems));
      }

      if (accessories.length > 0 && Math.random() > 0.4) {
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

  const sorted = candidates.sort((a, b) => b.rawScore - a.rawScore);
  const top = sorted.slice(0, Math.min(sorted.length, count));

  if (!top.length) return buildSingleItemOutfits(shoes, accessories, count);

  while (top.length < count) {
    top.push(top[top.length % top.length]);
  }

  return top;
}

export function filterByOccasion(items: ClothingItem[], occasion: string): ClothingItem[] {
  const allowed = CATEGORY_BY_OCCASION[occasion] ?? CATEGORY_BY_OCCASION.casual;
  const byOccasion = items.filter((i) => allowed.includes(i.styleType));
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
  const tops = closet.filter((i) => i.category === 'top' && matchesSeason(i, season));
  const bottoms = closet.filter((i) => i.category === 'bottom' && matchesSeason(i, season));
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
  const vibe = vibes[Math.floor(Math.random() * vibes.length)] ?? '';
  const style = styles[Math.floor(Math.random() * styles.length)] ?? 'Look';
  const suffix = score >= 8.5 ? ' *' : '';

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
  const geminiKey = `outfit-gemini-${user.skinToneId}-${user.skinUndertone}-${top6
    .map((candidate) => [candidate.top.id, candidate.bottom.id, candidate.shoes?.id, candidate.accessory?.id, candidate.outerwear?.id]
      .filter((x): x is string => Boolean(x))
      .join('|'))
    .join('::')}`;

  const { data: ratings, error } = await safeAsync(
    async () => managedRequest(
      geminiKey,
      async () => validateWithGemini(top6, `Tone ${user.skinToneId}`, user.skinUndertone, tasteProfile.styleIdentity, 'neutral', `${tasteProfile.patternTolerance}`),
      10 * 60 * 1000,
      1
    ),
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

export async function generateOutfits(
  occasion: string,
  closetItems: ClothingItem[],
  userProfile: UserProfile,
  tasteProfile: TasteProfile
): Promise<Outfit[]> {
  if (!closetItems.length) {
    return [];
  }

  const resolvedOccasion = resolveOccasion(occasion);
  const filtered = filterForOccasion(closetItems, resolvedOccasion);
  let candidates = buildGuaranteedOutfits(filtered, userProfile, 5);

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
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  const results = ranked.slice(0, 3);
  while (results.length < 3 && ranked.length > 0) {
    results.push(ranked[results.length % ranked.length]);
  }

  const outfits: Outfit[] = results.map((entry) => ({
    id: `outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: generateOutfitName(entry.candidate, resolvedOccasion, entry.finalScore),
    occasion: resolvedOccasion,
    itemIds: entry.items.map((item) => item.id),
    colorScore: Math.round(entry.rawScore * 10),
    skinScore: Math.round(entry.skinScore * 10),
    geminiScore: 7,
    tasteScore: Math.round(entry.tasteScore * 10),
    finalScore: Math.round(entry.finalScore * 10),
    wornOn: null,
    liked: 0,
    createdAt: new Date().toISOString(),
    reasons: [
      ...generateOutfitExplanation(entry.candidate, userProfile.skinToneId, userProfile.skinUndertone, resolvedOccasion),
      ...explainOutfitChoice(entry.candidate, tasteProfile),
    ].slice(0, 5),
  }));

  if (tasteProfile.feedbackCount > 0 && tasteProfile.feedbackCount % 5 === 0) {
    await safeAsync(async () => recalculateTasteWeights(), 'Outfit.recalculateWeights');
  }

  return outfits;
}

export function generateFallbackOutfits(closet: ClothingItem[], count = 3): Outfit[] {
  const tops = closet.filter(i => i.category === 'top');
  const bottoms = closet.filter(i => i.category === 'bottom');
  const shoes = closet.filter(i => i.category === 'shoes');
  const accessories = closet.filter(i => i.category === 'accessory');

  const results: Outfit[] = [];
  for (let i = 0; i < count; i++) {
    const top = tops[i % tops.length] || createPlaceholderItem('top');
    const bottom = bottoms[i % bottoms.length] || createPlaceholderItem('bottom');
    const shoe = shoes[i % shoes.length] || null;
    const items = [top, bottom];
    if (shoe) items.push(shoe);

    const outfit: Outfit = {
      id: `fallback-${Date.now()}-${i}`,
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

export async function generateGuaranteed(
  occasionInput: string,
  closet: ClothingItem[],
  profile: UserProfile,
  taste: TasteProfile
): Promise<Outfit[]> {
  const outfits = await generateOutfits(occasionInput, closet, profile, taste);
  if (outfits.length >= 3) return outfits;
  
  // Guarantee 3 even if filtered failed
  const fallback = generateFallbackOutfits(closet, 3 - outfits.length);
  return [...outfits, ...fallback].slice(0, 3);
}
