import {
  colorSimilar,
  getSeasonalPalette,
  isAnalogous,
  isComplementary,
  isNeutral,
  isStatementPiece,
  parseHSL,
  scoreColorHarmony,
  scoreColorPair,
  scoreContrastBalance,
  scoreOutfitProfessional,
  scorePatternMix,
  scoreSkinCompatibility,
} from '../src/services/colorEngine';
import { item } from './fixtures';

describe('colorEngine', () => {
  test('parses and classifies HSL relationships', () => {
    expect(parseHSL('hsl(210,40,45)')).toEqual({ h: 210, s: 40, l: 45 });
    expect(isComplementary({ h: 0 }, { h: 180 })).toBe(true);
    expect(isAnalogous({ h: 20 }, { h: 60 })).toBe(true);
    expect(isNeutral({ s: 10 })).toBe(true);
    expect(isStatementPiece({ s: 70 })).toBe(true);
  });

  test('scores color pairs and outfits in bounded range', () => {
    const top = item({ colorHsl: 'hsl(210,40,45)', colorHex: '#336699' });
    const bottom = item({ category: 'bottom', colorHsl: 'hsl(30,40,40)', colorHex: '#996633', colorFamily: 'brown' });

    expect(scoreColorPair(top.colorHsl, bottom.colorHsl)).toBeGreaterThanOrEqual(5);
    expect(scoreColorHarmony([top, bottom])).toBeGreaterThanOrEqual(5);
    expect(scoreOutfitProfessional([top, bottom], 3, 'Warm').total).toBeGreaterThanOrEqual(1);
  });

  test('skin, contrast, and pattern scores are bounded', () => {
    const pieces = [
      item({ colorHex: '#8B4513', colorHsl: 'hsl(25,76,31)', pattern: 'solid' }),
      item({ category: 'bottom', colorHex: '#111111', colorHsl: 'hsl(0,0,7)', pattern: 'checks' }),
    ];

    expect(scoreSkinCompatibility(pieces, 3, 'Warm')).toBeGreaterThanOrEqual(1);
    expect(scoreContrastBalance(pieces, 3)).toBeGreaterThanOrEqual(1);
    expect(scorePatternMix(pieces)).toBeGreaterThanOrEqual(1);
  });

  test('season and similarity helpers behave predictably', () => {
    expect(getSeasonalPalette(1, 'Cool')).toBe('Summer');
    expect(getSeasonalPalette(5, 'Warm')).toBe('Autumn');
    expect(colorSimilar('#ffffff', '#fefefe')).toBe(true);
    expect(colorSimilar('#ffffff', '#000000')).toBe(false);
  });
});
