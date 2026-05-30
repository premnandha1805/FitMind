import { getResetCountdown, isValidFitCheckResult, parseJsonStrict, readableError } from '../src/services/validationEngine';

const validFitCheck = {
  skin_tone_match: { score: 8, verdict: 'Flattering', reason: 'Works well' },
  color_harmony: { score: 8, verdict: 'Balanced', reason: 'Balanced' },
  proportion: { score: 7, verdict: 'Good', reason: 'Balanced' },
  styling_tips: ['Tuck the shirt'],
  color_tips: ['Use warm neutrals'],
  swap_suggestions: [],
  style_score: 8,
  one_line_verdict: 'Strong look',
};

describe('validationEngine', () => {
  test('parseJsonStrict parses valid JSON and throws invalid JSON', () => {
    expect(parseJsonStrict('{"ok":true}')).toEqual({ ok: true });
    expect(() => parseJsonStrict('{bad')).toThrow();
  });

  test('isValidFitCheckResult validates required fields', () => {
    expect(isValidFitCheckResult(validFitCheck)).toBe(true);
    expect(isValidFitCheckResult({ ...validFitCheck, style_score: '8' })).toBe(false);
    expect(isValidFitCheckResult(null)).toBe(false);
  });

  test('readableError maps technical failures to product copy', () => {
    expect(readableError('network failed')).toMatch(/internet/i);
    expect(readableError('quota exceeded limit:0')).toMatch(/quota/i);
    expect(readableError('timeout')).toMatch(/timed out/i);
  });

  test('getResetCountdown returns compact hour minute text', () => {
    expect(getResetCountdown('2099-01-01')).toMatch(/\d+h \d+m/);
  });
});
