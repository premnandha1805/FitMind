import { clamp, hexToRgb, hueDiff, rgbToHex, rgbToHsl } from '../src/utils/colorUtils';

describe('colorUtils', () => {
  test('clamp bounds values', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('hueDiff wraps around 360 degrees', () => {
    expect(hueDiff(350, 10)).toBe(20);
    expect(hueDiff(90, 270)).toBe(180);
  });

  test('hex and rgb conversions are stable', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#336699')).toEqual({ r: 51, g: 102, b: 153 });
    expect(rgbToHex(51, 102, 153)).toBe('#336699');
  });

  test('rgbToHsl detects primary color families', () => {
    expect(Math.round(rgbToHsl(255, 0, 0).h)).toBe(0);
    expect(Math.round(rgbToHsl(0, 255, 0).h)).toBe(120);
    expect(Math.round(rgbToHsl(0, 0, 255).h)).toBe(240);
  });
});
