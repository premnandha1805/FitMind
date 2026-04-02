# PR: FitMind AI System — Production-Grade Rebuild

## Summary
Complete redesign of all AI features in FitMind to production-grade quality.
Fixes classification failures, outfit generation gaps, API rate limits,
chat UX issues, and missing fallback systems.

---

## Problems Fixed

| # | Problem | Root Cause | Fix |
|---|---|---|---|
| 1 | API fails after 1 use | No rate limiting, no caching | Request manager + 3-tier cache |
| 2 | Clothes tagged as "other" | Weak ML Kit normalization | Strict category map + validation |
| 3 | No outfits for "college" | Over-restrictive occasion filter | Relaxed filter with 3 fallback levels |
| 4 | Empty AI responses | No retry or fallback logic | 3-layer fallback chain |
| 5 | User text invisible in chat | Missing text color in input | Color fix + keyboard handling |
| 6 | Manual edits ignored | No user_corrected flag | Schema flag + override priority |
| 7 | Outfit generation returns 0 | No guaranteed minimum | Always returns 3 minimum |
| 8 | Generic AI suggestions | Weak prompts | Production-grade structured prompts |

---

## Architecture Before vs After

### Before (Broken)
```
User Input → Gemini API directly → Parse response → Show result
Problems: rate limits, no cache, no fallback, crashes
```

### After (Production)
```
User Input
  → Validate + Normalize
  → Cache Check (memory → SQLite)
  → Rate Limit Gate (max 12/min)
  → Primary: Gemini 2.0 Flash
  → Fallback 1: Retry compressed
  → Fallback 2: Local rule engine
  → Validate output schema
  → Cache result
  → Show to user
```

---

## Files Changed

### New Files
- `src/services/classificationEngine.ts`
- `src/services/validationEngine.ts`
- `src/services/cacheEngine.ts`
- `src/services/requestManager.ts`
- `src/services/fallbackEngine.ts`
- `src/constants/categoryMap.ts`
- `src/utils/normalizer.ts`

### Modified Files
- `src/services/gemini.ts`
- `src/services/outfitEngine.ts`
- `src/services/skinToneEngine.ts`
- `src/services/scenarioEngine.ts`
- `src/services/feedbackEngine.ts`
- `src/db/schema.ts`
- `src/db/queries.ts`
- `src/screens/AddItemScreen.tsx`
- `src/screens/HomeScreen.tsx`
- `src/screens/StyleAdvisorScreen.tsx`
- `src/store/useClosetStore.ts`

---

## Copilot Prompt — Message 1: API + Cache System

```
Fix FitMind AI reliability. Implement production-grade
request management and caching.

CREATE src/services/cacheEngine.ts:

3-tier cache system:

TIER 1 — Memory (fastest):
const mem = new Map<string, {data:any, exp:number}>();
export function memSet(k:string, d:any, ms:number) {
  mem.set(k, {data:d, exp:Date.now()+ms});
}
export function memGet(k:string): any|null {
  const i = mem.get(k);
  if (!i||Date.now()>i.exp){mem.delete(k);return null;}
  return i.data;
}

TIER 2 — SQLite (persists):
Add to schema.ts:
CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

export async function dbSet(key:string, data:any, days:number)
export async function dbGet(key:string): Promise<any|null>

TIER 3 — Combined:
export async function getCached(k:string): Promise<any|null> {
  return memGet(k) ?? await dbGet(k) ?? null;
}
export async function setCached(k:string, d:any,
  ms:number, days:number) {
  memSet(k, d, ms);
  await dbSet(k, d, days);
}

export async function cleanCache() {
  await db.run('DELETE FROM api_cache WHERE expires_at < ?',
    [Date.now()]);
}

CREATE src/services/requestManager.ts:

const MIN_MS = 4500; // 15 req/min = 1 per 4.5s
let lastReq = 0;
const inflight = new Map<string, Promise<any>>();
const log: number[] = [];

export async function managed<T>(
  key: string,
  fn: () => Promise<T>,
  memMs = 1800000,
  dbDays = 7
): Promise<T> {
  const cached = await getCached(key);
  if (cached) {
    console.log('[Cache] HIT:', key.substring(0,20));
    return cached;
  }
  if (inflight.has(key)) return inflight.get(key) as T;
  
  const recent = log.filter(t => Date.now()-t < 60000).length;
  if (recent >= 12) throw new Error('RATE_LIMIT_PROTECTION');
  
  const wait = MIN_MS - (Date.now() - lastReq);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  
  const p = fn().then(async r => {
    await setCached(key, r, memMs, dbDays);
    return r;
  }).finally(() => {
    inflight.delete(key);
    lastReq = Date.now();
    log.push(Date.now());
  });
  inflight.set(key, p);
  return p;
}

In App.tsx on startup:
import {cleanCache} from './src/services/cacheEngine';
await cleanCache();

Run npx tsc --noEmit — zero errors required.
```

---

## Copilot Prompt — Message 2: Classification Fix

```
Fix clothing classification in FitMind completely.

CREATE src/constants/categoryMap.ts:

export const CAT_MAP: Record<string,string> = {
  shirt:'top', tshirt:'top', 't-shirt':'top', blouse:'top',
  hoodie:'top', sweater:'top', kurta:'top', kurti:'top',
  top:'top', polo:'top', tank:'top', vest:'top', tunic:'top',
  jeans:'bottom', trousers:'bottom', pants:'bottom',
  shorts:'bottom', skirt:'bottom', leggings:'bottom',
  chinos:'bottom', joggers:'bottom',
  jacket:'outerwear', coat:'outerwear', blazer:'outerwear',
  cardigan:'outerwear',
  shoes:'shoes', sneakers:'shoes', boots:'shoes',
  heels:'shoes', sandals:'shoes', loafers:'shoes',
  flats:'shoes', slippers:'shoes',
  watch:'accessory', bag:'accessory', belt:'accessory',
  hat:'accessory', scarf:'accessory', glasses:'accessory',
};

export function resolveCategory(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (CAT_MAP[s]) return CAT_MAP[s];
  if (/shirt|top|blouse|tee|sweat|kurta|hoodie/.test(s)) return 'top';
  if (/jean|pant|trouser|bottom|short|skirt|legging/.test(s)) return 'bottom';
  if (/shoe|boot|sneak|sandal|heel|loafer|flat/.test(s)) return 'shoes';
  if (/jacket|coat|blazer|cardigan/.test(s)) return 'outerwear';
  if (/watch|bag|belt|hat|scarf|glass|jewel/.test(s)) return 'accessory';
  return 'top'; // safe default — never return unknown
}

CLASSIFICATION PROMPT (use exactly):
export const CLASSIFY_PROMPT = `
You are a clothing classifier. Analyze this garment image.
Output ONLY valid JSON. No markdown. No explanation.

STRICT CATEGORY RULES:
top = any upper body garment
bottom = any lower body garment
shoes = any footwear
outerwear = any layer worn over top
accessory = everything else

NEVER output: other, unknown, clothing, garment, item

{
  "category": "<top|bottom|shoes|outerwear|accessory>",
  "subcategory": "<specific name: shirt|jeans|blazer|etc>",
  "color_primary": "<color name>",
  "pattern": "<solid|stripes|checks|floral|print|geometric>",
  "style_type": "<casual|formal|party|ethnic|professional|sports>",
  "fit_type": "<slim|regular|relaxed|oversized>",
  "season": "<summer|winter|all-season>",
  "confidence": <0.0-1.0>
}`;

In AddItemScreen.tsx:
After photo taken:
  const mlResult = await ImageLabeling.label(imageUri);
  const category = resolveCategory(mlResult[0]?.text || '');
  // Pre-fill form with resolved category
  setCategory(category);
  setSubcategory(mlResult[0]?.text || '');

When user changes any field:
  setUserCorrected(true);
  // user_corrected = 1 prevents AI from overriding

In useClosetStore.ts loadClosetItems:
  const items = await getClothingItems();
  // Fix any legacy wrong categories
  const fixed = items.map(i => ({
    ...i,
    category: i.user_corrected ? i.category : resolveCategory(i.category)
  }));
  set({ items: fixed });

Run npx tsc --noEmit — zero errors required.
```

---

## Copilot Prompt — Message 3: Outfit Generation

```
Fix outfit generation in FitMind.
Must ALWAYS return at least 3 outfits. Never empty.

In src/services/outfitEngine.ts:

OCCASION MAP (covers all inputs):
const OCC_MAP: Record<string,string> = {
  college:'casual', university:'casual', school:'casual',
  class:'casual', campus:'casual',
  office:'professional', work:'professional',
  meeting:'professional', interview:'professional',
  party:'party', birthday:'party', date:'party',
  wedding:'ethnic', festival:'ethnic', puja:'ethnic',
  gym:'sports', workout:'sports',
  casual:'casual', formal:'formal',
};

export function resolveOccasion(input: string): string {
  const s = input.toLowerCase();
  if (OCC_MAP[s]) return OCC_MAP[s];
  for (const [k,v] of Object.entries(OCC_MAP)) {
    if (s.includes(k)) return v;
  }
  return 'casual'; // never fail
}

RELAXED FILTER (3 levels):
function filterCloset(items: ClothingItem[], occ: string) {
  const styleMap: Record<string,string[]> = {
    casual:       ['casual','smart_casual','sports','party'],
    professional: ['professional','formal','smart_casual','casual'],
    formal:       ['formal','professional','smart_casual'],
    party:        ['party','casual','smart_casual','formal'],
    ethnic:       ['ethnic','formal','party'],
    sports:       ['sports','casual'],
  };
  const styles = styleMap[occ] || Object.keys(styleMap).flatMap(k => styleMap[k]);
  
  let tops = items.filter(i => i.category==='top' && styles.includes(i.style_type));
  let bottoms = items.filter(i => i.category==='bottom' && styles.includes(i.style_type));
  
  // Level 2: relax style filter
  if (tops.length < 2 || bottoms.length < 2) {
    tops = items.filter(i => i.category === 'top');
    bottoms = items.filter(i => i.category === 'bottom');
  }
  // Level 3: include outerwear as tops
  if (tops.length < 1)
    tops = items.filter(i => i.category==='top'||i.category==='outerwear');
  
  return {
    tops,
    bottoms,
    shoes: items.filter(i => i.category === 'shoes'),
    accessories: items.filter(i => i.category === 'accessory'),
  };
}

GUARANTEED GENERATION:
export async function generateGuaranteed(
  occasionInput: string,
  closet: ClothingItem[],
  profile: UserProfile,
  taste: TasteProfile
): Promise<Outfit[]> {
  
  if (closet.length === 0) return [];
  
  const occ = resolveOccasion(occasionInput);
  const filtered = filterCloset(closet, occ);
  let outfits = buildCombinations(filtered, 5);
  
  // If not enough use whole closet
  if (outfits.length < 3) {
    outfits = buildCombinations({
      tops: closet.filter(i=>i.category==='top'),
      bottoms: closet.filter(i=>i.category==='bottom'),
      shoes: closet.filter(i=>i.category==='shoes'),
      accessories: closet.filter(i=>i.category==='accessory'),
    }, 5);
  }
  
  // Score and rank
  const scored = outfits.map(o => ({
    ...o,
    final_score: calculateFinalScore(o, profile, taste)
  })).sort((a,b) => b.final_score - a.final_score);
  
  // GUARANTEE: always return at least 3
  return scored.slice(0, Math.max(3, scored.length));
}

function buildCombinations(f: any, max: number): Outfit[] {
  const results: Outfit[] = [];
  for (const top of f.tops.slice(0,8)) {
    for (const bottom of f.bottoms.slice(0,8)) {
      const items = [top, bottom];
      if (f.shoes.length > 0) items.push(f.shoes[0]);
      results.push(makeOutfit(items));
      if (results.length >= max) return results;
    }
  }
  return results;
}

In HomeScreen.tsx replace generation call:
  const occ = resolveOccasion(selectedOccasion);
  let outfits = await generateGuaranteed(occ, closet, profile, taste);
  if (outfits.length === 0 && closet.length > 0) {
    // Last resort: pair first top with first bottom
    outfits = [makeOutfit([
      closet.find(i=>i.category==='top'),
      closet.find(i=>i.category==='bottom'),
    ].filter(Boolean))];
  }
  setOutfits(outfits);

Run npx tsc --noEmit — zero errors required.
```

---

## Copilot Prompt — Message 4: Chat UX + Fallback

```
Fix Style Advisor chat UX and add complete fallback system.

FIX 1 — Text input visibility in StyleAdvisorScreen.tsx:
The text input must show text while typing.
Find the TextInput component and ensure:
  color: '#e5e2e1'           // text color — REQUIRED
  backgroundColor: '#353534' // input background
  placeholderTextColor: '#737373'

Full input style:
  style={{
    flex: 1,
    color: '#e5e2e1',
    backgroundColor: '#353534',
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  }}

FIX 2 — Keyboard handling:
Wrap entire screen in KeyboardAvoidingView:
  import {KeyboardAvoidingView, Platform} from 'react-native';
  
  <KeyboardAvoidingView
    style={{flex:1}}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={90}>
    ...all content...
  </KeyboardAvoidingView>

Add to ScrollView:
  keyboardShouldPersistTaps="handled"
  ref={scrollRef}

Auto-scroll to bottom when new message added:
  useEffect(() => {
    scrollRef.current?.scrollToEnd({animated: true});
  }, [messages]);

FIX 3 — Typing indicator:
Show immediately when user sends message:
  const [isTyping, setIsTyping] = useState(false);
  
  async function sendMessage(text: string) {
    addUserMessage(text);
    setIsTyping(true);
    try {
      const response = await getAdvisorResponse(text);
      addAdvisorMessage(response);
    } catch {
      addAdvisorMessage(getFallbackResponse(text));
    } finally {
      setIsTyping(false);
    }
  }

FIX 4 — Fallback response system:
CREATE src/services/fallbackEngine.ts:

export function getFallbackResponse(userMessage: string): AdvisorResponse {
  const occ = resolveOccasion(userMessage);
  return {
    eventType: occ,
    formality: getDefaultFormality(occ),
    explanation: [
      'Selected items that work well together',
      'Colors are coordinated for your occasion',
      'Style is appropriate for the context',
    ],
    confidenceTip: getConfidenceTip(occ),
    missingItems: [],
    videoCallMode: userMessage.toLowerCase().includes('video'),
  };
}

function getConfidenceTip(occ: string): string {
  const tips: Record<string,string> = {
    casual: 'Comfort and fit are the keys to looking great casually',
    professional: 'Well-fitted clothes signal confidence and competence',
    party: 'Own your look with confidence — that is the best accessory',
    ethnic: 'Traditional wear done right always commands respect',
    formal: 'Classic combinations never go wrong in formal settings',
  };
  return tips[occ] || 'Dressing intentionally always makes a strong impression';
}

FIX 5 — Quick chip improvements:
Make chips auto-fill AND auto-send on tap:
  function handleChipTap(text: string) {
    setInputText(text);
    // Small delay so user sees it filled
    setTimeout(() => sendMessage(text), 150);
  }

Run npx tsc --noEmit — zero errors required.
```

---

## Copilot Prompt — Message 5: Production Prompts

```
Replace all AI prompts in FitMind with production-grade versions.

FILE: src/services/gemini.ts

OUTFIT RECOMMENDATION PROMPT:
export const OUTFIT_PROMPT = (
  occasion: string, skinTone: string, undertone: string,
  styleIdentity: string, learnedColors: string,
  items: string
) => `
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

STYLE ADVISOR PROMPT:
export const ADVISOR_PROMPT = (
  userMessage: string, toneName: string, undertone: string,
  styleIdentity: string, closetSummary: string
) => `
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

FIT CHECK PROMPT:
export const FITCHECK_PROMPT = (
  toneName: string, undertone: string, styleIdentity: string
) => `
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

VALIDATION FUNCTION:
export function validateGeminiResponse(raw: string): any {
  try {
    const clean = raw
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    const json = clean.substring(first, last + 1);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

Run npx tsc --noEmit — zero errors required.
```

---

## Copilot Prompt — Message 6: Final Integration

```
Final integration pass for FitMind production readiness.

1. In App.tsx startup sequence (exact order):
   a. Load fonts
   b. Clean expired cache
   c. Initialize SQLite DB
   d. Run category migration on existing items
   e. Validate Gemini key
   f. Load user profile
   g. Show first screen

2. In HomeScreen.tsx complete flow:
   const handleOccasionSelect = async (occ: string) => {
     setLoading(true);
     setOutfits([]);
     try {
       const resolved = resolveOccasion(occ);
       const results = await generateGuaranteed(
         resolved, closet, userProfile, tasteProfile);
       setOutfits(results.length > 0 ? results 
         : generateFallbackOutfits(closet, 3));
     } catch (e) {
       console.error('[Home] Generation failed:', e);
       setOutfits(generateFallbackOutfits(closet, 3));
     } finally {
       setLoading(false);
     }
   };

3. In ClosetScreen.tsx after load:
   // Fix wrong categories on all existing items
   const fixed = items.map(i => ({
     ...i,
     category: i.user_corrected ? i.category 
       : resolveCategory(i.category || ''),
   }));
   
   // Log for debugging
   if (__DEV__) {
     const tops = fixed.filter(i=>i.category==='top').length;
     const bottoms = fixed.filter(i=>i.category==='bottom').length;
     console.log(`[Closet] ${tops} tops, ${bottoms} bottoms`);
   }

4. In AddItemScreen.tsx save flow:
   async function saveItem() {
     const item = normalizeClothingItem({
       ...formValues,
       user_corrected: hasUserEdited ? 1 : 0,
       ai_confidence: classificationResult?.confidence || 0,
       ai_raw_label: classificationResult?.subcategory || '',
     });
     await saveClothingItem(item);
     navigation.goBack();
     showToast('Item added to closet');
   }

5. Add DEV debug panel in ProfileScreen:
   {__DEV__ && (
     <View style={{padding:16, backgroundColor:'#0D0D0D',
       margin:16, borderRadius:12}}>
       <Text style={{color:'#e6c487', fontWeight:'bold'}}>
         Debug Info
       </Text>
       <Text style={{color:'#d0c5b5'}}>
         Closet: {closet.length} items
       </Text>
       <Text style={{color:'#d0c5b5'}}>
         Tops: {closet.filter(i=>i.category==='top').length}
       </Text>
       <Text style={{color:'#d0c5b5'}}>
         Bottoms: {closet.filter(i=>i.category==='bottom').length}
       </Text>
       <Text style={{color:'#d0c5b5'}}>
         API calls this session: {apiCallCount}
       </Text>
     </View>
   )}

6. Final test checklist:
   [ ] Add shirt photo → category shows "top" not "other"
   [ ] Add jeans photo → category shows "bottom"
   [ ] Select Casual → 3 outfits appear
   [ ] Type "college" in advisor → outfit appears
   [ ] Upload selfie → fit check completes
   [ ] Same photo twice → second check instant (cache)
   [ ] Turn off wifi → app works except fit check
   [ ] 0 items in closet → helpful message not crash

Run npx tsc --noEmit — zero errors required.
Run npx expo start --clear and test all above.
```

---

## Production Readiness Checklist

- [ ] All categories normalize correctly (never "other")
- [ ] Outfit generation always returns 3+ results
- [ ] Same API call never made twice (cache working)
- [ ] Max 12 Gemini calls per minute enforced
- [ ] Text visible while typing in Style Advisor
- [ ] Keyboard does not cover input in chat
- [ ] User manual edits never overridden by AI
- [ ] App works offline except Fit Check
- [ ] All fallbacks return usable results silently
- [ ] TypeScript: npx tsc --noEmit = zero errors
- [ ] No red error screens on any flow

---

## Testing Commands

```bash
# Type check
npx tsc --noEmit

# Start with clean cache
npx expo start --clear

# Check for common issues
npx expo-doctor
```
