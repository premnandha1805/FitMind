import { safeAsync } from '../src/utils/safeAsync';

describe('safeAsync', () => {
  test('wraps successful async work', async () => {
    await expect(safeAsync(async () => 42, 'success')).resolves.toEqual({ data: 42, error: null });
  });

  test('wraps thrown errors without leaking exceptions', async () => {
    await expect(safeAsync(async () => { throw new Error('nope'); }, 'failure')).resolves.toEqual({ data: null, error: 'nope' });
  });
});
