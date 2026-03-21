import { FitCheckResult } from '../types/models';

export function parseJsonStrict(input: string): unknown {
  return JSON.parse(input);
}

export function isValidFitCheckResult(value: unknown): value is FitCheckResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.style_score === 'number' &&
    typeof obj.one_line_verdict === 'string' &&
    typeof obj.skin_tone_match === 'object' &&
    typeof obj.color_harmony === 'object' &&
    typeof obj.proportion === 'object' &&
    Array.isArray(obj.styling_tips) &&
    Array.isArray(obj.color_tips) &&
    Array.isArray(obj.swap_suggestions)
  );
}

export function readableError(message: string): string {
  if (message.toLowerCase().includes('timeout')) return 'Request timed out. Please retry.';
  if (message.toLowerCase().includes('network')) return 'No internet connection for AI validation.';
  if (message.toLowerCase().includes('quota') || message.toLowerCase().includes('limit')) return 'Daily limit reached. Please try again tomorrow.';
  return 'Something went wrong. Please try again.';
}

export function getResetCountdown(dateKey: string): string {
  const now = new Date();
  const target = new Date(`${dateKey}T23:59:59`);
  const ms = Math.max(0, target.getTime() - now.getTime());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}
