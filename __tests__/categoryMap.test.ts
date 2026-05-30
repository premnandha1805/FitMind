import { normalizePattern, normalizeStyle, resolveCategory } from '../src/constants/categoryMap';

describe('categoryMap', () => {
  test.each([
    ['t-shirt', 'top'],
    ['linen shirt', 'top'],
    ['blue jeans', 'bottom'],
    ['chelsea boots', 'shoes'],
    ['wool blazer', 'outerwear'],
    ['leather belt', 'accessory'],
    ['unrecognized garment', 'top'],
  ] as const)('resolveCategory(%s) -> %s', (input, expected) => {
    expect(resolveCategory(input)).toBe(expected);
  });

  test.each([
    ['business', 'professional'],
    ['smart-casual', 'smart_casual'],
    ['tailored', 'professional'],
    ['evening', 'party'],
    ['???', 'casual'],
  ] as const)('normalizeStyle(%s) -> %s', (input, expected) => {
    expect(normalizeStyle(input)).toBe(expected);
  });

  test.each([
    ['stripe', 'stripes'],
    ['plaid', 'checks'],
    ['printed', 'print'],
    ['unknown-pattern', 'solid'],
  ] as const)('normalizePattern(%s) -> %s', (input, expected) => {
    expect(normalizePattern(input)).toBe(expected);
  });
});
