import { extractJSON, validateFitCheckResponse, validateGeminiResponse } from '../src/services/gemini';

const fitCheck = {
  skin_tone_match: { score: 12, verdict: 'Flattering', reason: 'Color works' },
  color_harmony: { score: -1, verdict: 'Balanced', reason: 'Colors relate', harmony_type: 'Analogous' },
  proportion: { score: 8, verdict: 'Balanced', reason: 'Good proportions' },
  styling_tips: ['Add structure'],
  color_tips: ['Use warm accents'],
  swap_suggestions: [],
  what_works: ['Clean base'],
  confidence_tip: 'Stand tall',
  style_score: 9,
  one_line_verdict: 'Polished',
};

describe('gemini parsing and validation', () => {
  test('extractJSON tolerates markdown fences and extra prose', () => {
    expect(extractJSON('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(extractJSON('before {"ok":true,} after')).toEqual({ ok: true });
    expect(extractJSON('no json')).toBeNull();
  });

  test('validateFitCheckResponse validates and clamps scores', () => {
    const copy = JSON.parse(JSON.stringify(fitCheck));
    expect(validateFitCheckResponse(copy)).toBe(true);
    expect(copy.skin_tone_match.score).toBe(10);
    expect(copy.color_harmony.score).toBe(1);
  });

  test('validateFitCheckResponse rejects partial payloads', () => {
    expect(validateFitCheckResponse({ ...fitCheck, styling_tips: [] })).toBe(false);
    expect(validateFitCheckResponse({})).toBe(false);
  });

  test('validateGeminiResponse extracts object payloads', () => {
    expect(validateGeminiResponse('text {"ratings":[{"index":0}]}')).toEqual({ ratings: [{ index: 0 }] });
    expect(validateGeminiResponse('bad')).toBeNull();
  });
});
