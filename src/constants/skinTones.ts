import { SkinToneColors } from '../types/models';

export const SKIN_TONES = [
  { id: 1, name: 'Very Fair' },
  { id: 2, name: 'Fair' },
  { id: 3, name: 'Medium Light' },
  { id: 4, name: 'Medium' },
  { id: 5, name: 'Medium Dark' },
  { id: 6, name: 'Deep' },
] as const;

const TABLE: Record<string, SkinToneColors> = {
  '1-Cool': {
    excellentColors: ['Navy', 'Burgundy', 'Emerald Green', 'Dusty Rose', 'Lavender', 'Ivory'],
    goodColors: ['Soft Blue', 'Sage Green', 'Mauve', 'Charcoal', 'Camel'],
    avoidColors: ['Neon Yellow', 'Bright Orange', 'Heavy Brown'],
  },
  '2-Neutral': {
    excellentColors: ['Cobalt Blue', 'Forest Green', 'Deep Red', 'Blush Pink', 'Camel', 'White'],
    goodColors: ['Coral', 'Teal', 'Olive', 'Cream', 'Slate Grey'],
    avoidColors: ['Very pale pastels', 'Washed-out beiges'],
  },
  '3-Warm': {
    excellentColors: ['Coral', 'Warm Orange', 'Olive Green', 'Gold', 'Rust', 'Peach', 'Warm White'],
    goodColors: ['Camel', 'Terracotta', 'Mustard', 'Warm Brown', 'Teal'],
    avoidColors: ['Cool greys', 'Icy pastels', 'Stark White'],
  },
  '4-Warm': {
    excellentColors: ['Earthy Terracotta', 'Warm Camel', 'Rust', 'Deep Teal', 'Mustard', 'Warm Red'],
    goodColors: ['Olive', 'Navy', 'Burnt Orange', 'Forest Green', 'Cream'],
    avoidColors: ['Pale pink', 'Icy blue', 'Washed-out yellow'],
  },
  '4-Neutral': {
    excellentColors: ['Earthy Terracotta', 'Warm Camel', 'Rust', 'Deep Teal', 'Mustard', 'Warm Red'],
    goodColors: ['Olive', 'Navy', 'Burnt Orange', 'Forest Green', 'Cream'],
    avoidColors: ['Pale pink', 'Icy blue', 'Washed-out yellow'],
  },
  '5-Warm': {
    excellentColors: ['Mustard Yellow', 'Deep Green', 'Rich Burgundy', 'Cobalt', 'Warm Orange', 'Gold'],
    goodColors: ['Camel', 'Teal', 'Deep Purple', 'Rust', 'Off-White'],
    avoidColors: ['Pale beige', 'Dusty rose', 'Light grey'],
  },
  '6-Cool': {
    excellentColors: ['Bright White', 'Cobalt Blue', 'Bold Red', 'Deep Emerald', 'Royal Purple', 'Hot Pink'],
    goodColors: ['Camel', 'Burnt Orange', 'Mustard', 'Bright Teal', 'Champagne'],
    avoidColors: ['Dark Brown', 'Very dark navy', 'Muted olive'],
  },
  '6-Neutral': {
    excellentColors: ['Bright White', 'Cobalt Blue', 'Bold Red', 'Deep Emerald', 'Royal Purple', 'Hot Pink'],
    goodColors: ['Camel', 'Burnt Orange', 'Mustard', 'Bright Teal', 'Champagne'],
    avoidColors: ['Dark Brown', 'Very dark navy', 'Muted olive'],
  },
};

export function getSkinToneColorTable(toneId: number, undertone: 'Warm' | 'Cool' | 'Neutral'): SkinToneColors {
  const key = `${toneId}-${undertone}`;
  return TABLE[key] ?? TABLE['3-Warm'];
}
