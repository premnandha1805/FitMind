import NetInfo from '@react-native-community/netinfo';
import { extractJSON, getGeminiKey, validateWithGemini } from './gemini';
import {
  applyColorRules,
  applySkinToneFilter,
  applyTasteFilter,
  generateOutfitExplanation,
  generateOutfitName,
} from './outfitEngine';
import { scoreCandidateAgainstTaste } from './tasteEngine';
import { AVOID_COLORS_MAP, CONFIDENCE_TIPS } from '../constants/scenarioRules';
import { ClothingItem, Outfit, OutfitCandidate, TasteProfile, UserProfile } from '../types/models';

const SCENARIO_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const SCENARIO_MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
] as const;

export interface ScenarioContext {
  event_type: string;
  industry_context: 'tech' | 'finance' | 'creative' | 'academic' | 'general';
  formality: number;
  setting: 'indoor' | 'outdoor' | 'video_call' | 'mixed';
  culture_context: 'general' | 'ethnic' | 'western' | 'mixed';
  weather_relevant: boolean;
  upper_body_only: boolean;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
  avoid_colors: string[];
  priority_attributes: string[];
  occasion_category: 'casual' | 'formal' | 'party' | 'ethnic' | 'professional';
  power_level: 'authoritative' | 'approachable' | 'creative' | 'traditional';
  confidence_tip: string;
  dress_code: 'smart casual' | 'business casual' | 'business formal' | 'black tie' | 'ethnic formal' | 'creative';
  missing_item_suggestions: string[];
  styling_notes: string;
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
  dresscode?: string;
  stylingNotes?: string;
  missingItems: string[];
  videoCallMode: boolean;
  formality: number;
  eventType: string;
  powerLevel?: string;
  allScores: { color: number; skin: number; taste: number; gemini: number; overall: number } | null;
  closestOutfit: Outfit | null;
  closestExplanation: string[];
}

const INDUSTRY_RULES = {
  tech: {
    formal: 'Smart casual - avoid full suits unless C-suite',
    casual: 'Clean minimal - well-fitted basics over logos',
    colors: ['navy', 'grey', 'white', 'minimal patterns'],
    avoid: ['loud prints', 'excessive jewelry', 'wrinkled clothes'],
  },
  finance: {
    formal: 'Conservative business - navy/charcoal/grey preferred',
    casual: 'Business casual - blazer always safe',
    colors: ['navy', 'charcoal', 'white', 'light blue', 'burgundy'],
    avoid: ['bright colors', 'casual shoes', 'unbuttoned collars'],
  },
  creative: {
    formal: 'Creative professional - personality pieces welcome',
    casual: 'Express personality - bold colors ok',
    colors: ['any palette', 'statement pieces welcome'],
    avoid: ['boring generic outfits'],
  },
  academic: {
    formal: 'Polished but practical - smart layers work best',
    casual: 'Quietly confident and functional',
    colors: ['navy', 'olive', 'cream', 'earth tones'],
    avoid: ['overly flashy accents'],
  },
  general: {
    formal: 'Clean and event-appropriate',
    casual: 'Balanced and context-aware',
    colors: ['balanced palette'],
    avoid: ['extreme mismatch'],
  },
} as const;

const FALLBACK_CONTEXT: ScenarioContext = {
  event_type: 'general event',
  industry_context: 'general',
  formality: 5,
  setting: 'indoor',
  culture_context: 'general',
  weather_relevant: false,
  upper_body_only: false,
  time_of_day: 'evening',
  avoid_colors: [],
  priority_attributes: [],
  occasion_category: 'casual',
  power_level: 'approachable',
  confidence_tip: '',
  dress_code: 'smart casual',
  missing_item_suggestions: [],
  styling_notes: 'Keep proportions clean and colors cohesive for this setting.',
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

  const industry = obj.industry_context === 'tech' || obj.industry_context === 'finance' || obj.industry_context === 'creative' || obj.industry_context === 'academic' || obj.industry_context === 'general'
    ? obj.industry_context
    : 'general';

  const culture = obj.culture_context === 'general' || obj.culture_context === 'ethnic' || obj.culture_context === 'western' || obj.culture_context === 'mixed'
    ? obj.culture_context
    : 'general';

  const occasion = obj.occasion_category === 'casual' || obj.occasion_category === 'formal' || obj.occasion_category === 'party' || obj.occasion_category === 'ethnic' || obj.occasion_category === 'professional'
    ? obj.occasion_category
    : 'casual';

  const timeOfDay = obj.time_of_day === 'morning' || obj.time_of_day === 'afternoon' || obj.time_of_day === 'evening' || obj.time_of_day === 'night'
    ? obj.time_of_day
    : 'evening';

  const powerLevel = obj.power_level === 'authoritative' || obj.power_level === 'approachable' || obj.power_level === 'creative' || obj.power_level === 'traditional'
    ? obj.power_level
    : 'approachable';

  const dressCode = obj.dress_code === 'smart casual' || obj.dress_code === 'business casual' || obj.dress_code === 'business formal' || obj.dress_code === 'black tie' || obj.dress_code === 'ethnic formal' || obj.dress_code === 'creative'
    ? obj.dress_code
    : 'smart casual';

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

  const stylingNotes = typeof obj.styling_notes === 'string' && obj.styling_notes.trim()
    ? obj.styling_notes.trim()
    : 'Balance structure and polish to match the context while staying authentic to your style.';

  return {
    event_type: eventType,
    industry_context: industry,
    formality: clampFormality(obj.formality),
    setting,
    culture_context: culture,
    weather_relevant: Boolean(obj.weather_relevant),
    upper_body_only: Boolean(obj.upper_body_only) || setting === 'video_call',
    time_of_day: timeOfDay,
    avoid_colors: Array.from(new Set([...avoid, ...mappedAvoid])),
    priority_attributes: priority,
    occasion_category: occasion,
    power_level: powerLevel,
    confidence_tip: tip,
    dress_code: dressCode,
    missing_item_suggestions: missing,
    styling_notes: stylingNotes,
  };
}

const buildScenarioPrompt = (userMessage: string,
  toneName: string, undertone: string,
  styleIdentity: string, topColors: string[]): string => `
You are an expert personal stylist AI with knowledge of:
- Corporate dress codes across industries
- Cultural occasion requirements
- Event-specific styling rules
- Color psychology for different settings
- Body language and confidence dressing

User situation: "${userMessage}"
Their skin tone: ${toneName} with ${undertone} undertone
Their style: ${styleIdentity}
Colors they love: ${topColors.join(', ')}

Extract precise styling context. Respond ONLY with valid JSON:
{
  "event_type": "<specific event name>",
  "industry_context": "<tech|finance|creative|academic|general>",
  "formality": <1-10>,
  "setting": "<indoor|outdoor|video_call|mixed>",
  "culture_context": "<general|ethnic|western|mixed>",
  "weather_relevant": <boolean>,
  "upper_body_only": <boolean>,
  "time_of_day": "<morning|afternoon|evening|night>",
  "avoid_colors": ["<color to avoid and why>"],
  "priority_attributes": ["<most important style attribute>"],
  "occasion_category": "<casual|formal|party|ethnic|professional>",
  "power_level": "<authoritative|approachable|creative|traditional>",
  "confidence_tip": "<one highly specific tip for THIS exact situation>",
  "dress_code": "<smart casual|business casual|business formal|black tie|ethnic formal|creative>",
  "missing_item_suggestions": ["<item that would elevate this look>"],
  "styling_notes": "<2 sentence expert note about this specific occasion>"
}`;

async function callGeminiPrompt(prompt: string): Promise<{ text: string; status: number }> {
  const key = await getGeminiKey();
  if (!key) {
    throw new Error('Gemini API key is not configured.');
  }

  let lastStatus = 500;
  let lastText = '';

  for (const model of SCENARIO_MODEL_CANDIDATES) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(`${SCENARIO_API_BASE}/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    clearTimeout(timeoutHandle);

    const json = await response.json() as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const message = json.error?.message?.toLowerCase() ?? '';
    const unsupported = response.status === 404 || message.includes('not supported for generatecontent') || message.includes('not found for api version');
    if (unsupported) {
      continue;
    }

    lastStatus = response.status;
    lastText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { text: lastText, status: lastStatus };
  }

  return { text: lastText, status: lastStatus };
}

export async function extractScenarioContext(
  userMessage: string,
  skinToneId: number,
  undertone: string,
  styleIdentity = 'classic',
  topColors: string[] = []
): Promise<ExtractResult> {
  const network = await NetInfo.fetch();
  if (!network.isConnected) {
    throw new Error('NO_INTERNET');
  }

  const toneName = `Tone ${skinToneId}`;
  const prompt = buildScenarioPrompt(userMessage, toneName, undertone, styleIdentity, topColors);

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
    name: generateOutfitName(candidate, context.occasion_category, candidate.finalScore),
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

function candidateItems(candidate: OutfitCandidate): ClothingItem[] {
  return [candidate.top, candidate.bottom, candidate.shoes, candidate.accessory, candidate.outerwear]
    .filter((x): x is ClothingItem => Boolean(x));
}

function getScenarioNote(context: ScenarioContext): string {
  const notes: Record<string, string> = {
    tech_interview: 'Smart casual signals cultural fit at tech companies',
    finance_interview: 'Conservative dress builds instant credibility',
    first_date: 'Put-together but not overdressed shows confidence',
    wedding_guest: 'Elegant but never competing with the wedding party',
    presentation: 'Solid colors keep attention focused on your words',
    video_call: 'Camera-friendly colors create professional presence',
  };

  const eventKey = context.event_type.toLowerCase().replace(/\s+/g, '_');
  const key = `${context.industry_context}_${eventKey}`;
  return notes[key] || notes[eventKey] || context.styling_notes;
}

function getPowerNote(powerLevel: ScenarioContext['power_level'], items: ClothingItem[]): string {
  const hasStructured = items.some((i) => ['formal', 'professional', 'classic', 'tailored'].includes(i.styleType.toLowerCase()));
  if (powerLevel === 'authoritative') {
    return hasStructured
      ? 'Structured lines reinforce an authoritative presence.'
      : 'Add one structured piece to project stronger authority.';
  }
  if (powerLevel === 'creative') return 'A personality accent keeps this expressive without losing polish.';
  if (powerLevel === 'traditional') return 'Classic proportions keep the look respectful and dependable.';
  return 'Approachable styling keeps you open and confident in conversation.';
}

function getCultureNote(culture: ScenarioContext['culture_context']): string | null {
  if (culture === 'ethnic') return 'Cultural context respected with event-appropriate polish.';
  if (culture === 'mixed') return 'Balanced styling bridges multiple cultural expectations well.';
  return null;
}

function detectMissingItems(context: ScenarioContext, closet: ClothingItem[], outfit: OutfitCandidate): string[] {
  const needed: string[] = [];
  const items = candidateItems(outfit);

  if (context.formality >= 7) {
    const hasBlazerInOutfit = items.some((i) => i.category === 'outerwear' || i.styleType.toLowerCase().includes('blazer'));
    if (!hasBlazerInOutfit) {
      const hasAnyBlazer = closet.some((i) => i.styleType.toLowerCase().includes('blazer') || i.styleType.toLowerCase().includes('jacket') || i.category === 'outerwear');
      if (!hasAnyBlazer) {
        needed.push('A structured blazer would elevate this look significantly');
      }
    }
  }

  if (context.setting === 'outdoor' && context.weather_relevant) {
    const hasOuterwear = items.some((i) => i.category === 'outerwear');
    if (!hasOuterwear && !closet.some((i) => i.category === 'outerwear')) {
      needed.push('A light jacket suitable for outdoor wear');
    }
  }

  return needed;
}

function buildOutfitExplanationForScenario(
  outfit: OutfitCandidate,
  context: ScenarioContext,
  toneId: number,
  undertone: string,
  closetItems: ClothingItem[]
): AdvisorResponse {
  const baseExplanations = generateOutfitExplanation(outfit, toneId, undertone, context.occasion_category);
  const items = candidateItems(outfit);
  const scenarioNote = getScenarioNote(context);
  const powerNote = getPowerNote(context.power_level, items);
  const cultureNote = getCultureNote(context.culture_context);
  const industry = INDUSTRY_RULES[context.industry_context];
  const industryRuleNote = context.formality >= 7 ? industry.formal : industry.casual;
  const missingItems = [
    ...detectMissingItems(context, closetItems, outfit),
    ...context.missing_item_suggestions,
  ];

  return {
    outfit: buildOutfitFromCandidate(outfit, context),
    explanation: [...baseExplanations, scenarioNote, powerNote, cultureNote, industryRuleNote]
      .filter((x): x is string => Boolean(x))
      .slice(0, 5),
    confidenceTip: context.confidence_tip,
    dresscode: context.dress_code,
    stylingNotes: context.styling_notes,
    missingItems: Array.from(new Set(missingItems)),
    videoCallMode: context.upper_body_only,
    formality: context.formality,
    eventType: context.event_type,
    powerLevel: context.power_level,
    allScores: {
      color: outfit.layer1Score,
      skin: outfit.layer2Score,
      taste: outfit.layer3Score,
      gemini: outfit.geminiScore,
      overall: outfit.finalScore,
    },
    closestOutfit: null,
    closestExplanation: [],
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

  if (candidate) {
    return buildOutfitExplanationForScenario(candidate, context, 3, 'Neutral', closetItems);
  }

  const missingItems = context.missing_item_suggestions
    .filter((item) => !hasMatchingItemInCloset(item, closetItems));

  const confidenceTip = context.confidence_tip || CONFIDENCE_TIPS.default;
  const explanation: string[] = [
    getScenarioNote(context),
    context.styling_notes,
    context.formality >= 7 ? INDUSTRY_RULES[context.industry_context].formal : INDUSTRY_RULES[context.industry_context].casual,
  ].filter((x): x is string => Boolean(x));

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
    dresscode: context.dress_code,
    stylingNotes: context.styling_notes,
    missingItems,
    videoCallMode: context.upper_body_only,
    formality: context.formality,
    eventType: context.event_type,
    powerLevel: context.power_level,
    allScores: null,
    closestOutfit: result.closestOutfit,
    closestExplanation,
  };
}

export function handleVideoCallMode(response: AdvisorResponse): AdvisorResponse {
  return response;
}
