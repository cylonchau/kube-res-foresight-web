import type { PendingProgress } from '@/service/request/pending';

/**
 * The words for how far a read that the platform works out on its own has come: the name of its stage (in the language of the page) and how many of its units are answered.
 * Nothing when the platform has not counted yet, so the page says only how long it has waited.
 */
export function progressParams(
  progress: PendingProgress | undefined,
  label: (stage: string) => string
): { stage: string; done: number; total: number } | null {
  if (!progress || !progress.total || progress.total <= 0) return null;
  return {
    stage: progress.stage ? label(progress.stage) : '',
    done: Math.min(progress.done, progress.total),
    total: progress.total
  };
}
