import NetInfo from '@react-native-community/netinfo';
import { extractJSON, getGeminiKey, validateWithGemini } from './gemini';
import {
  applyColorRules,
  applySkinToneFilter,
  applyTasteFilter,
  generateOutfitName,
} from './outfitEngine';
import { scoreCandidateAgainstTaste } from './tasteEngine';
import { AVOID_COLORS_MAP, CONFIDENCE_TIPS } from '../constants/scenarioRules';
import { ClothingItem, Outfit, OutfitCandidate, TasteProfile, UserProfile } from '../types/models';

const SCENARIO_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export interface ScenarioContext {
  event_type: string;
  formality: number;
  setting: 'indoor' | 'outdoor' | 'video_call' | 'mixed';
  culture_context: 'general' | 'ethnic' | 'western' | 'mixed';
  weather_relevant: boolean;
  upper_body_only: boolean;
  avoid_colors: string[];
  priority_attributes: string[];
  occasion_category: 'casual' | 'formal' | 'party' | 'ethnic' | 'professional';
  confidence_tip: string;
  missing_item_suggestions: string[];
}

export interface ScenarioOutfitResult {
  outfit: Outfit | null;
  candidate: OutfitCandidate | null;
  closestOutfit: Outfit | null;
  closestCandidate: OutfitCandidate | null;
}

export interface AdvisorResponse {
  outfit: Outfit | null;
  explanation: string[];
  confidenceTip: string;
  missingItems: string[];
  videoCallMode: boolean;
  formality: number;
  eventType: string;
  allScores: { color: number; skin: number; taste: number; gemini: number; overall: number } | null;
  closestOutfit: Outfit | null;
  closestExplanation: string[];
}

const FALLBACK_CONTEXT: ScenarioContext = {
  event_type: 'general event',
  formality: 5,
  setting: 'indoor',
  culture_context: 'general',
  weather_relevant: false,
  upper_body_only: false,
  avoid_colors: [],
  priority_attributes: [],
  occasion_category: 'casual',
  confidence_tip: '',
  missing_item_suggestions: [],
};

interface ExtractResult {
  context: ScenarioContext;
  usedFallback: boolean;
}

function clampFormality(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 5;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function normalizeContext(raw: unknown): ScenarioContext {
  const obj = (typeof raw === 'object' && raw !== null) ? raw as Record<string, unknown> : {};

  const eventType = typeof obj.event_type === 'string' && obj.event_type.trim()
    ? obj.event_type.trim()
    : 'general event';

  const setting = obj.setting === 'indoor' || obj.setting === 'outdoor' || obj.setting === 'video_call' || obj.setting === 'mixed'
    ? obj.setting
    : 'indoor';

  const culture = obj.culture_context === 'general' || obj.culture_context === 'ethnic' || obj.culture_context === 'western' || obj.culture_context === 'mixed'
    ? obj.culture_context
    : 'general';

  const occasion = obj.occasion_category === 'casual' || obj.occasion_category === 'formal' || obj.occasion_category === 'party' || obj.occasion_category === 'ethnic' || obj.occasion_category === 'professional'
    ? obj.occasion_category
    : 'casual';

  const avoid = Array.isArray(obj.avoid_colors)
    ? obj.avoid_colors.filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase())
    : [];

  const priority = Array.isArray(obj.priority_attributes)
    ? obj.priority_attributes.filter((x): x is string => typeof x === 'string')
    : [];

  const missing = Array.isArray(obj.missing_item_suggestions)
    ? obj.missing_item_suggestions.filter((x): x is string => typeof x === 'string').slice(0, 2)
    : [];

  const eventKey = eventType.toLowerCase().replace(/\s+/g, '_');
  const mappedAvoid = AVOID_COLORS_MAP[eventKey] ?? [];
  const tip = typeof obj.confidence_tip === 'string' && obj.confidence_tip.trim()
    ? obj.confidence_tip.trim()
    : (CONFIDENCE_TIPS[eventKey] ?? CONFIDENCE_TIPS.default);

  return {
    event_type: eventType,
    formality: clampFormality(obj.formality),
    setting,
    culture_context: culture,
    weather_relevant: Boolean(obj.weather_relevant),
    upper_body_only: Boolean(obj.upper_body_only) || setting === 'video_call',
    avoid_colors: Array.from(new Set([...avoid, ...mappedAvoid])),
    priority_attributes: priority,
    occasion_category: occasion,
    confidence_tip: tip,
    missing_item_suggestions: missing,
  };
}

async function callGeminiPrompt(prompt: string): Promise<{ text: string; status: number }> {
  const key = await getGeminiKey();
  if (!key) {
    throw new Error('Gemini API key is not configured.');
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 12000);
  const response = await fetch(`${SCENARIO_API_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  clearTimeout(timeoutHandle);

  const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return { text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? '', status: response.status };
}

export async function extractScenarioContext(
  userMessage: string,
  skinToneId: number,
  undertone: string
): Promise<ExtractResult> {
  const network = await NetInfo.fetch();
  if (!network.isConnected) {
    throw new Error('NO_INTERNET');
  }

  void skinToneId;
  void undertone;

  const prompt = `You are a professional fashion stylist assistant.
The user described this situation: '[${userMessage}]'
Extract styling context and respond ONLY with valid JSON:
{
  event_type: string,
  formality: number (1-10, 1=beach casual 10=black tie),
  setting: 'indoor'|'outdoor'|'video_call'|'mixed',
  culture_context: 'general'|'ethnic'|'western'|'mixed',
  weather_relevant: boolean,
  upper_body_only: boolean,
  avoid_colors: string[],
  priority_attributes: string[],
  occasion_category: 'casual'|'formal'|'party'|'ethnic'|'professional',
  confidence_tip: string (one sentence relevant to this exact situation),
  missing_item_suggestions: string[] (items that would elevate this look
    but may not be in closet - max 2)
}`;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await callGeminiPrompt(prompt);
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }

    const parsed = extractJSON(response.text);
    if (parsed) {
      return {
        context: normalizeContext(parsed),
        usedFallback: false,
      };
    }

    if (attempt === 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 800));
    }
  }

  return { context: normalizeContext({ ...FALLBACK_CONTEXT }), usedFallback: true };
}

function getSeasonFromMonth(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function isOppositeSeason(itemSeason: string, current: 'spring' | 'summer' | 'autumn' | 'winter'): boolean {
  const normalized = itemSeason.toLowerCase();
  const oppositeByCurrent: Record<string, string[]> = {
    spring: ['winter'],
    summer: ['winter'],
    autumn: ['summer'],
    winter: ['summer'],
  };
  return oppositeByCurrent[current]?.includes(normalized) ?? false;
}

function hexToColorName(hex: string): string {
  const normalized = hex.trim().toLowerCase();
  const named: Record<string, string> = {
    '#ffffff': 'white',
    '#fff': 'white',
    '#f5f5dc': 'cream',
    '#fffff0': 'ivory',
    '#000000': 'black',
    '#ff0000': 'bright red',
    '#dc2626': 'bright red',
    '#ffff00': 'bright yellow',
  };

  if (named[normalized]) return named[normalized];

  const safe = normalized.replace('#', '');
  if (safe.length !== 6) return 'unknown';
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);

  if (r > 220 && g > 220 && b > 220) return 'white';
  if (r < 40 && g < 40 && b < 40) return 'black';
  if (r > 200 && g < 90 && b < 90) return 'bright red';
  if (r > 210 && g > 180 && b < 120) return 'bright yellow';
  if (r > 200 && g > 170 && b > 140) return 'cream';
  if (b > 140 && r < 120 && g < 150) return 'navy';
  if (g > 130 && b > 100 && r < 120) return 'teal';
  return 'unknown';
}

function applyOccasionCategoryFilter(context: ScenarioContext, items: ClothingItem[]): ClothingItem[] {
  const matched = items.filter((item) => item.styleType.toLowerCase() === context.occasion_category);
  if (matched.length >= 4) return matched;

  const adjacent: Record<ScenarioContext['occasion_category'], string[]> = {
    formal: ['professional'],
    professional: ['formal'],
    party: ['casual'],
    ethnic: [],
    casual: ['party'],
  };

  if (context.occasion_category === 'ethnic') {
    return items.filter((item) => item.styleType.toLowerCase() === 'ethnic');
  }

  const adjacentItems = items.filter((item) => adjacent[context.occasion_category].includes(item.styleType.toLowerCase()));
  return [...matched, ...adjacentItems];
}

function applyFormalityFilter(context: ScenarioContext, items: ClothingItem[]): ClothingItem[] {
  if (context.formality >= 7) {
    return items.filter((item) => item.styleType.toLowerCase() !== 'casual');
  }
  if (context.formality <= 3) {
    return items.filter((item) => {
      const style = item.styleType.toLowerCase();
      return style !== 'formal' && style !== 'professional';
    });
  }
  return items;
}

function applySeasonFilter(items: ClothingItem[]): ClothingItem[] {
  const now = new Date();
  const current = getSeasonFromMonth(now.getMonth() + 1);
  return items.filter((item) => {
    const season = item.season?.trim();
    if (!season || season.toLowerCase() === 'all-season') return true;
    return !isOppositeSeason(season, current);
  });
}

function applyAvoidColorsFilter(context: ScenarioContext, items: ClothingItem[]): ClothingItem[] {
  if (!context.avoid_colors.length) return items;
  const avoidSet = new Set(context.avoid_colors.map((c) => c.toLowerCase()));
  return items.filter((item) => !avoidSet.has(hexToColorName(item.colorHex).toLowerCase()));
}

export function filterClosetForScenario(context: ScenarioContext, closetItems: ClothingItem[]): { items: ClothingItem[]; note: string | null } {
  let filtered = applyOccasionCategoryFilter(context, closetItems);
  filtered = applyFormalityFilter(context, filtered);
  filtered = applySeasonFilter(filtered);
  filtered = applyAvoidColorsFilter(context, filtered);

  if (context.culture_context === 'ethnic') {
    filtered = filtered.filter((item) => item.styleType.toLowerCase() !== 'western');
  }

  const note = context.upper_body_only ? 'Video call look - top and accessories only' : null;
  return { items: filtered, note };
}

function tuneTasteForFormality(context: ScenarioContext, taste: TasteProfile): TasteProfile {
  if (context.formality >= 7) {
    return { ...taste, skinToneWeight: 0.8 };
  }
  if (context.formality <= 3) {
    return { ...taste, boldnessPreference: Math.max(taste.boldnessPreference, 0.8) };
  }
  return taste;
}

function buildOutfitFromCandidate(candidate: OutfitCandidate, context: ScenarioContext): Outfit {
  return {
    id: `advisor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: generateOutfitName(context.occasion_category, candidate.layer1Score, candidate.layer2Score),
    occasion: context.occasion_category,
    itemIds: [candidate.top.id, candidate.bottom.id, candidate.shoes?.id, candidate.accessory?.id, candidate.outerwear?.id]
      .filter((x): x is string => Boolean(x)),
    colorScore: candidate.layer1Score,
    skinScore: candidate.layer2Score,
    geminiScore: candidate.geminiScore,
    tasteScore: candidate.layer3Score,
    finalScore: candidate.finalScore,
    wornOn: null,
    liked: 0,
    createdAt: new Date().toISOString(),
    reasons: [],
  };
}

function applyVideoCallCandidate(candidate: OutfitCandidate): OutfitCandidate {
  return {
    ...candidate,
    bottom: candidate.bottom,
    shoes: null,
    outerwear: null,
  };
}

export async function generateScenarioOutfit(
  filteredItems: ClothingItem[],
  context: ScenarioContext,
  userProfile: UserProfile,
  tasteProfile: TasteProfile,
  excludeOutfitIds: string[] = []
): Promise<ScenarioOutfitResult> {
  const baseCandidates = applyColorRules(filteredItems);
  if (!baseCandidates.length) {
    return { outfit: null, candidate: null, closestOutfit: null, closestCandidate: null };
  }

  const layer2 = applySkinToneFilter(baseCandidates, userProfile.skinToneId, userProfile.skinUndertone, 3);
  const tunedTaste = tuneTasteForFormality(context, tasteProfile);
  const layer3 = applyTasteFilter(layer2, tunedTaste, 2);
  const pool = layer3.length ? layer3 : layer2;

  const topPool = pool.slice(0, 6);
  const ratings = await validateWithGemini(
    topPool,
    `Tone ${userProfile.skinToneId}`,
    userProfile.skinUndertone,
    tasteProfile.styleIdentity,
    context.occasion_category,
    tunedTaste.patternTolerance.toFixed(2)
  );

  const weighted = topPool.map((candidate, index) => {
    const geminiScore = ratings.find((x) => x.index === index)?.score ?? 0;
    const tasteWeighted = scoreCandidateAgainstTaste(candidate, tunedTaste);
    const finalScore = candidate.layer1Score * 0.25 + candidate.layer2Score * 0.3 + tasteWeighted * 0.25 + geminiScore * 0.2;
    return {
      ...candidate,
      layer3Score: tasteWeighted,
      geminiScore,
      finalScore,
    };
  }).sort((a, b) => b.finalScore - a.finalScore);

  const bestStrict = weighted.find((candidate) => {
    const key = [candidate.top.id, candidate.bottom.id, candidate.shoes?.id, candidate.accessory?.id, candidate.outerwear?.id]
      .filter((x): x is string => Boolean(x))
      .sort()
      .join('|');
    return !excludeOutfitIds.includes(key);
  });

  if (!bestStrict) {
    const closest = weighted[0] ?? null;
    return {
      outfit: null,
      candidate: null,
      closestOutfit: closest ? buildOutfitFromCandidate(closest, context) : null,
      closestCandidate: closest,
    };
  }

  const finalCandidate = context.upper_body_only ? applyVideoCallCandidate(bestStrict) : bestStrict;
  return {
    outfit: buildOutfitFromCandidate(finalCandidate, context),
    candidate: finalCandidate,
    closestOutfit: null,
    closestCandidate: null,
  };
}

function reasonForItem(item: ClothingItem, context: ScenarioContext): string {
  const category = item.category;
  if (context.upper_body_only && (category === 'top' || category === 'accessory')) {
    return category === 'top'
      ? 'solid and camera-friendly near your face'
      : 'adds polish without distracting on camera';
  }

  if (context.formality >= 7) {
    if (category === 'top') return 'sharp silhouette fits the formal tone';
    if (category === 'bottom') return 'structured balance keeps the look refined';
    if (category === 'accessory') return 'minimal detail adds sophistication';
    return 'keeps the look elevated for the occasion';
  }

  if (context.formality <= 3) {
    if (category === 'top') return 'relaxed styling keeps this low-pressure and easy';
    if (category === 'bottom') return 'comfortable shape supports a casual mood';
    if (category === 'accessory') return 'small accent adds personality';
    return 'fits a laid-back setting';
  }

  if (category === 'top') return 'works with your event setting and flatters your tone';
  if (category === 'bottom') return 'anchors the look without overpowering';
  if (category === 'accessory') return 'clean finishing touch for this scenario';
  return 'supports a balanced outfit for this event';
}

function hasMatchingItemInCloset(missingItem: string, closetItems: ClothingItem[]): boolean {
  const normalized = missingItem.toLowerCase();
  return closetItems.some((item) => {
    const haystack = `${item.category} ${item.styleType} ${item.pattern ?? ''}`.toLowerCase();
    return haystack.includes(normalized) || normalized.includes(item.category);
  });
}

export function buildAdvisorResponse(
  result: ScenarioOutfitResult,
  context: ScenarioContext,
  closetItems: ClothingItem[]
): AdvisorResponse {
  const candidate = result.candidate;
  const explanation: string[] = [];

  if (candidate) {
    const items = [candidate.top, candidate.bottom, candidate.shoes, candidate.accessory, candidate.outerwear]
      .filter((x): x is ClothingItem => Boolean(x));

    items.forEach((item) => {
      if (context.upper_body_only && item.category !== 'top' && item.category !== 'accessory') return;
      const itemLabel = `${item.category[0].toUpperCase()}${item.category.slice(1)}`;
      explanation.push(`${itemLabel} - ${reasonForItem(item, context)}`);
    });
  }

  const missingItems = context.missing_item_suggestions
    .filter((item) => !hasMatchingItemInCloset(item, closetItems));

  const confidenceTip = context.confidence_tip || CONFIDENCE_TIPS.default;

  const closestExplanation = result.closestCandidate
    ? [
      `${result.closestCandidate.top.category} - closest available option from your closet`,
      `${result.closestCandidate.bottom.category} - provides the nearest balance for this situation`,
    ]
    : [];

  if (context.upper_body_only) {
    explanation.push('Video call tip: camera sees only your upper body. Focus on top and accessories for maximum impact.');
    explanation.push('Avoid white (overexposes) and red (bleeds on camera). Navy, teal and earth tones work best on video.');
  }

  return {
    outfit: result.outfit,
    explanation,
    confidenceTip,
    missingItems,
    videoCallMode: context.upper_body_only,
    formality: context.formality,
    eventType: context.event_type,
    allScores: candidate
      ? {
        color: candidate.layer1Score,
        skin: candidate.layer2Score,
        taste: candidate.layer3Score,
        gemini: candidate.geminiScore,
        overall: candidate.finalScore,
      }
      : null,
    closestOutfit: result.closestOutfit,
    closestExplanation,
  };
}

export function handleVideoCallMode(response: AdvisorResponse): AdvisorResponse {
  return response;
}
