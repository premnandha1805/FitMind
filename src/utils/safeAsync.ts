export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: string
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[${context}] ${message}`);
    return { data: null, error: message };
  }
}
