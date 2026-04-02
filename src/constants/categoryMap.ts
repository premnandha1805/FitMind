import { Category, ClothingPattern, ClothingStyleType } from '../types/models';

export const CAT_MAP: Record<string, Category> = {
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

export function resolveCategory(raw: string): Category {
  const s = raw.toLowerCase().trim();
  if (CAT_MAP[s]) return CAT_MAP[s];
  if (/shirt|top|blouse|tee|sweat|kurta|hoodie/.test(s)) return 'top';
  if (/jean|pant|trouser|bottom|short|skirt|legging/.test(s)) return 'bottom';
  if (/shoe|boot|sneak|sandal|heel|loafer|flat/.test(s)) return 'shoes';
  if (/jacket|coat|blazer|cardigan/.test(s)) return 'outerwear';
  if (/watch|bag|belt|hat|scarf|glass|jewel/.test(s)) return 'accessory';
  return 'top'; // safe default — never return unknown
}

export const STYLE_MAP: Record<string, ClothingStyleType> = {
  casual: 'casual', everyday: 'casual', daily: 'casual',
  college: 'casual', street: 'casual',
  formal: 'formal', office: 'formal', business: 'professional',
  work: 'professional', professional: 'professional',
  party: 'party', night: 'party', festive: 'party',
  ethnic: 'ethnic', traditional: 'ethnic', cultural: 'ethnic',
  sports: 'sports', gym: 'sports', athletic: 'sports',
};

const PATTERN_MAP: Record<string, ClothingPattern> = {
  solid: 'solid',
  stripe: 'stripes',
  stripes: 'stripes',
  check: 'checks',
  checks: 'checks',
  plaid: 'checks',
  floral: 'floral',
  print: 'print',
  printed: 'print',
  geometric: 'geometric',
  abstract: 'abstract',
  other: 'other',
};


export function normalizeStyle(raw: string): ClothingStyleType {
  const clean = raw.toLowerCase().trim().replace(/[^a-z_\s-]/g, '');
  if (clean in STYLE_MAP) return STYLE_MAP[clean];
  if (clean === 'relaxed') return 'casual';
  if (clean === 'tailored') return 'professional';
  if (clean === 'evening') return 'party';
  if (clean === 'minimalist') return 'smart_casual';
  if (clean === 'smart casual' || clean === 'smart-casual' || clean === 'smart_casual') return 'smart_casual';
  return 'casual';
}

export function normalizePattern(raw: string): ClothingPattern {
  const clean = raw.toLowerCase().trim().replace(/[^a-z\s-]/g, '');
  return PATTERN_MAP[clean] ?? 'solid';
}
