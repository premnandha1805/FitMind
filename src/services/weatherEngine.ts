import { ClothingItem } from '../types/models';

export interface WeatherData {
  temperature: number;
  condition: 'hot' | 'warm' | 'cool' | 'cold' | 'rainy';
  description: string;
}

export async function getWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url);
  const data = await res.json();
  const temp = Number(data?.current?.temperature_2m ?? 24);
  const code = Number(data?.current?.weather_code ?? 0);
  const rainy = code >= 51;

  return {
    temperature: temp,
    condition: rainy
      ? 'rainy'
      : temp > 32
        ? 'hot'
        : temp > 24
          ? 'warm'
          : temp > 16
            ? 'cool'
            : 'cold',
    description: rainy ? 'rainy' : `${Math.round(temp)}°C`,
  };
}

export function filterByWeather(items: ClothingItem[], weather: WeatherData): ClothingItem[] {
  return items.filter((item) => {
    if (weather.condition === 'hot') return item.season !== 'winter';
    if (weather.condition === 'cold') return item.season !== 'summer';
    return true;
  });
}
