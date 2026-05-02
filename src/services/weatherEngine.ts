import { ClothingItem } from '../types/models';
import { managedRequest } from './requestManager';
import { CacheCategory } from './cacheEngine';

export interface WeatherData {
  temperature: number;
  condition: 'hot' | 'warm' | 'cool' | 'cold' | 'rainy';
  description: string;
}

export async function getWeather(lat: number, lon: number): Promise<WeatherData> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { temperature: 24, condition: 'warm', description: 'location unavailable' };
  }
  const key = `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  return managedRequest<WeatherData>(
    key,
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`WEATHER_HTTP_${res.status}`);
        const data = await res.json();
        const temp = Number(data?.current?.temperature_2m ?? 24);
        const code = Number(data?.current?.weather_code ?? 0);
        const rainy = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);

        return {
          temperature: temp,
          condition: rainy ? 'rainy' : temp > 32 ? 'hot' : temp > 24 ? 'warm' : temp > 16 ? 'cool' : 'cold',
          description: rainy ? 'rainy' : `${Math.round(temp)}°C`,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    CacheCategory.WEATHER,
    { skipRateLimit: true, fallbackFn: () => ({ temperature: 24, condition: 'warm', description: 'fallback' }) }
  );
}

export function filterByWeather(items: ClothingItem[], weather: WeatherData): ClothingItem[] {
  return items.filter((item) => {
    if (weather.condition === 'hot') return item.season !== 'winter';
    if (weather.condition === 'cold') return item.season !== 'summer';
    return true;
  });
}
