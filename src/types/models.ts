export type Undertone = 'Warm' | 'Cool' | 'Neutral';

export type Category = 'top' | 'bottom' | 'shoes' | 'accessory' | 'outerwear';

export type ColorFamily =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'grey'
  | 'black'
  | 'white'
  | 'neutral'
  | 'warm'
  | 'cool';

export type ClothingPattern = 'solid' | 'stripes' | 'checks' | 'floral' | 'print' | 'geometric' | 'abstract' | 'other';

export type ClothingStyleType = 'casual' | 'formal' | 'party' | 'ethnic' | 'professional' | 'sports' | 'smart_casual';

export type FitType = 'slim' | 'regular' | 'relaxed' | 'oversized' | 'fitted';

export type ClothingSeason = 'summer' | 'winter' | 'spring' | 'autumn' | 'all-season';

export type PatternType = 'solid' | 'subtle' | 'bold' | 'all' | 'unknown';

export type FitPreference = 'relaxed' | 'fitted';

export type StyleIdentity = 'minimal' | 'classic' | 'bold' | 'traditional';

export interface SkinToneResult {
  toneId: number;
  toneName: string;
  undertone: Undertone;
  hexPreview: string;
}

export interface UserProfile {
  id: string;
  skinToneId: number;
  skinUndertone: Undertone;
  skinImagePath: string | null;
  onboarded: number;
  createdAt: string;
}

export interface ClothingItem {
  id: string;
  imagePath: string;
  category: Category;
  subcategory: string;
  colorHsl: string;
  colorHex: string;
  colorFamily: ColorFamily;
  pattern: ClothingPattern;
  styleType: ClothingStyleType;
  fitType: FitType;
  season: ClothingSeason;
  userCorrected: number;
  aiConfidence: number;
  aiRawLabel: string;
  timesWorn: number;
  lastWorn: string | null;
  createdAt: string;
}

export interface Outfit {
  id: string;
  name: string;
  occasion: string;
  itemIds: string[];
  colorScore: number;
  skinScore: number;
  geminiScore: number;
  tasteScore: number;
  finalScore: number;
  wornOn: string | null;
  liked: number;
  createdAt: string;
  reasons: string[];
}

export interface OutfitCandidate {
  top: ClothingItem;
  bottom: ClothingItem;
  shoes: ClothingItem | null;
  accessory: ClothingItem | null;
  outerwear: ClothingItem | null;
  layer1Score: number;
  layer2Score: number;
  layer3Score: number;
  geminiScore: number;
  finalScore: number;
  reasons: string[];
}

export interface FitCheckResult {
  skin_tone_match: { score: number; verdict: string; reason: string };
  color_harmony: { score: number; verdict: string; reason: string; harmony_type?: string };
  proportion: { score: number; verdict: string; reason: string };
  styling_tips: string[];
  color_tips: string[];
  swap_suggestions: Array<{
    item_type: string;
    current_issue?: string;
    suggested_color?: string;
    reason: string;
    color?: string;
    item_id?: string;
  }>;
  what_works: string[];
  confidence_tip?: string;
  style_score: number;
  one_line_verdict: string;
}

export interface TasteProfile {
  contrastPreference: number;
  warmCoolBias: number;
  patternTolerance: number;
  accessoryInterest: number;
  formalityComfort: number;
  skinToneWeight: number;
  boldnessPreference: number;
  layeringPreference: number;
  feedbackCount: number;
  lastUpdated: string | null;
  lovedColors: string[];
  dislikedColors: string[];
  lovedPatterns: string[];
  dislikedPatterns: string[];
  fitPreference: FitPreference;
  styleIdentity: StyleIdentity;
  blockedPatterns: string[];
}

export interface TasteInsight {
  id: string;
  text: string;
}

export interface SkinToneColors {
  excellentColors: string[];
  goodColors: string[];
  avoidColors: string[];
}

export interface OutfitComposition {
  dominant: ClothingItem;
  secondary: ClothingItem;
  accent: ClothingItem | null;
  ruleScoreAdjustment: number;
}

export interface ExplicitPreferences {
  lovedColors: string[];
  dislikedColors: string[];
  lovedPatterns: string[];
  dislikedPatterns: string[];
  fitPreference: FitPreference;
  styleIdentity: StyleIdentity;
}
