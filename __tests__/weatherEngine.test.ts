import { item } from './fixtures';
import { filterByWeather } from '../src/services/weatherEngine';

describe('weatherEngine', () => {
  test('filterByWeather excludes winter items on hot days', () => {
    const closet = [
      item({ id: 'linen', season: 'summer' }),
      item({ id: 'coat', season: 'winter' }),
      item({ id: 'denim', season: 'all-season' }),
    ];

    expect(filterByWeather(closet, { temperature: 36, condition: 'hot', description: 'hot' }).map((x) => x.id))
      .toEqual(['linen', 'denim']);
  });

  test('filterByWeather excludes summer items on cold days', () => {
    const closet = [
      item({ id: 'linen', season: 'summer' }),
      item({ id: 'coat', season: 'winter' }),
      item({ id: 'denim', season: 'all-season' }),
    ];

    expect(filterByWeather(closet, { temperature: 8, condition: 'cold', description: 'cold' }).map((x) => x.id))
      .toEqual(['coat', 'denim']);
  });
});
