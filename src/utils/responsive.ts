import { useWindowDimensions } from 'react-native';

const BASE_WIDTH = 390;

export function scale(size: number, width: number): number {
  return Math.round((size * width) / BASE_WIDTH);
}

export function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const compact = width < 380;
  const tablet = width >= 768;

  const rs = (size: number, min?: number, max?: number): number => {
    const scaled = scale(size, width);
    if (typeof min === 'number' || typeof max === 'number') {
      return clamp(min ?? scaled, scaled, max ?? scaled);
    }
    return scaled;
  };

  return {
    width,
    height,
    compact,
    tablet,
    rs,
  };
}
