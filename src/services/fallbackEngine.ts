import { scoreOutfitForSkinTone, scoreColorPair }
  from './colorEngine';

function isHardQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return lower.includes('quota exceeded')
    || lower.includes('limit:0')
    || lower.includes('limit: 0')
    || lower.includes('free_tier_requests')
    || lower.includes('free_tier_input_token_count');
}

export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback1: () => Promise<T>,
  fallback2: () => T
): Promise<T> {
  try {
    return await Promise.race([
      primary(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000))
    ]);
  } catch (e1) {
    if (isHardQuotaError(e1)) {
      console.log('[Fallback] Hard quota reached, using local fallback2');
      return fallback2();
    }
    console.log('[Fallback] Primary failed, trying fallback1');
    try {
      return await fallback1();
    } catch (e2) {
      if (isHardQuotaError(e2)) {
        console.log('[Fallback] Hard quota reached on fallback1, using local fallback2');
      }
      console.log('[Fallback] Using local fallback2');
      return fallback2();
    }
  }
}

export function localFitCheck(items: any[], skinToneId: number,
  undertone: string): any {
  const colorScore = items.length > 1
    ? scoreColorPair(items[0].color_hsl as any, items[1].color_hsl as any)
    : 7;
  const skinScore = scoreOutfitForSkinTone(items as any, skinToneId, undertone as any);

  return {
    skin_tone_match: { score: skinScore, verdict: 'Good',
      reason: 'Colors complement your skin tone' },
    color_harmony: { score: colorScore, verdict: 'Balanced',
      reason: 'Color combination works well together' },
    proportion: { score: 7, verdict: 'Good',
      reason: 'Outfit proportions look balanced' },
    styling_tips: [
      'Ensure your clothes are well fitted',
      'Add a minimal accessory to elevate the look',
      'Keep colors cohesive throughout'
    ],
    color_tips: ['Your color palette works well together'],
    swap_suggestions: [],
    what_works: [
      'The outfit already looks coordinated and wearable',
      'Your current color direction is safe for daily styling'
    ],
    confidence_tip: 'Stand tall and keep one focal piece to sharpen the look.',
    style_score: Math.round((colorScore + skinScore) / 2),
    one_line_verdict: 'A solid outfit choice for your style.'
  };
}
