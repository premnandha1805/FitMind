import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { extractJSON, getGeminiKey, prepareImageForGemini } from './gemini';
import { CAT_MAP, resolveCategory, normalizePattern, normalizeStyle } from '../constants/categoryMap';
import { Category, ClothingPattern, ClothingStyleType, ClothingSeason, FitType } from '../types/models';

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

export interface MLKitLabel {
  text: string;
  confidence: number;
}

export interface ClassificationResult {
  category: Category;
  subcategory: string;
  color_primary?: string;
  color_secondary?: string;
  color_hex?: string;
  pattern: ClothingPattern;
  style_type: ClothingStyleType;
  fit_type: FitType;
  season: ClothingSeason;
  confidence: number;
  ai_raw_label: string;
  source?: 'mlkit' | 'gemini' | 'mlkit_fallback';
}

let cachedLabelFn: ((imageUri: string) => Promise<Array<{ text: string; confidence?: number }>>) | null | undefined;

async function getLabelFn(): Promise<((imageUri: string) => Promise<Array<{ text: string; confidence?: number }>>) | null> {
  if (cachedLabelFn !== undefined) {
    return cachedLabelFn;
  }

  if (Constants.appOwnership === 'expo' || Platform.OS === 'web') {
    cachedLabelFn = null;
    return null;
  }

  try {
    const mod = await import('@react-native-ml-kit/image-labeling');
    const candidate = (mod as { default?: { label?: (imageUri: string) => Promise<Array<{ text: string; confidence?: number }>> }; label?: (imageUri: string) => Promise<Array<{ text: string; confidence?: number }>> }).default?.label
      ?? (mod as { default?: { label?: (imageUri: string) => Promise<Array<{ text: string; confidence?: number }>> }; label?: (imageUri: string) => Promise<Array<{ text: string; confidence?: number }>> }).label
      ?? null;
    cachedLabelFn = candidate;
    return candidate;
  } catch {
    cachedLabelFn = null;
    return null;
  }
}

async function runMLKit(imageUri: string): Promise<MLKitLabel[]> {
  const labelFn = await getLabelFn();
  if (!labelFn) return [];

  try {
    const labels = await labelFn(imageUri);
    return labels
      .map((label) => ({ text: String(label.text ?? ''), confidence: Number(label.confidence ?? 0.5) }))
      .filter((label) => label.text.trim().length > 0);
  } catch {
    return [];
  }
}

function normalizeSeason(raw: string): ClothingSeason {
  const lower = raw.toLowerCase().trim();
  if (lower === 'summer' || lower === 'winter' || lower === 'all-season') return lower;
  if (lower === 'spring' || lower === 'autumn') return lower;
  return 'all-season';
}

function normalizeFitType(raw: string): FitType {
  const lower = raw.toLowerCase().trim();
  if (lower === 'slim' || lower === 'regular' || lower === 'relaxed' || lower === 'oversized' || lower === 'fitted') {
    return lower;
  }
  return 'regular';
}

function normalizeMLKitLabels(labels: MLKitLabel[]): ClassificationResult {
  const sorted = [...labels].sort((a, b) => b.confidence - a.confidence);

  for (const label of sorted) {
    const clean = label.text.toLowerCase().trim();
    const category = resolveCategory(clean);
    if (category !== 'top' || CAT_MAP[clean]) {
      return {
        category,
        subcategory: clean,
        ai_raw_label: label.text,
        confidence: label.confidence,
        pattern: 'solid',
        style_type: 'casual',
        fit_type: 'regular',
        season: 'all-season',
      };
    }
  }

  return {
    category: 'top',
    subcategory: 'clothing',
    ai_raw_label: sorted[0]?.text || 'unknown',
    confidence: 0.5,
    pattern: 'solid',
    style_type: 'casual',
    fit_type: 'regular',
    season: 'all-season',
  };
}

async function callGeminiClassify(imageUri: string): Promise<unknown> {
  const key = await getGeminiKey();
  if (!key) {
    throw new Error('Gemini API key not configured');
  }

  const imageBase64 = await prepareImageForGemini(imageUri);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        systemInstruction: { parts: [{ text: CLASSIFY_PROMPT }] },
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
        ],
      }],
      generationConfig: {
        response_mime_type: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini classification failed (${response.status})`);
  }

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n').trim() ?? '';
  if (!text) {
    throw new Error('Gemini classification returned empty response');
  }

  return extractJSON(text) ?? JSON.parse(text);
}

function validateClassification(raw: any): ClassificationResult {
  const VALID_CATEGORIES: Category[] = ['top', 'bottom', 'shoes', 'accessory', 'outerwear'];
  const VALID_PATTERNS: ClothingPattern[] = ['solid', 'stripes', 'checks', 'floral', 'print', 'geometric', 'abstract', 'other'];
  const VALID_STYLES: ClothingStyleType[] = ['casual', 'formal', 'party', 'ethnic', 'professional', 'sports', 'smart_casual'];

  const nextCategory = VALID_CATEGORIES.includes(raw?.category)
    ? raw.category as Category
    : resolveCategory(String(raw?.subcategory ?? ''));

  return {
    category: nextCategory,
    subcategory: String(raw?.subcategory || 'item').toLowerCase(),
    color_hex: String(raw?.color_hex || '#808080'),
    color_primary: typeof raw?.color_primary === 'string' ? raw.color_primary : undefined,
    color_secondary: typeof raw?.color_secondary === 'string' ? raw.color_secondary : undefined,
    pattern: VALID_PATTERNS.includes(raw?.pattern)
      ? raw.pattern as ClothingPattern
      : normalizePattern(String(raw?.pattern || 'solid')),
    style_type: VALID_STYLES.includes(raw?.style_type)
      ? raw.style_type as ClothingStyleType
      : normalizeStyle(String(raw?.style_type || 'casual')),
    fit_type: normalizeFitType(String(raw?.fit_type || 'regular')),
    season: normalizeSeason(String(raw?.season || 'all-season')),
    confidence: Number(raw?.confidence || 0.7),
    ai_raw_label: String(raw?.subcategory || ''),
  };
}

export async function classifyClothingItem(
  imageUri: string
): Promise<ClassificationResult> {
  const mlKitResult = await runMLKit(imageUri);
  const normalized = normalizeMLKitLabels(mlKitResult);

  if (normalized.confidence >= 0.8) {
    return { ...normalized, source: 'mlkit' };
  }

  try {
    const geminiResult = await callGeminiClassify(imageUri);
    const validated = validateClassification(geminiResult);
    return { ...validated, source: 'gemini' };
  } catch {
    return {
      ...normalized,
      source: 'mlkit_fallback',
      confidence: 0.6,
    };
  }
}
