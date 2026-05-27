/**
 * Metrics engine — derives productivity metrics from logged events.
 */
import {
  LoggedEvent, countByType, positiveFeedbackCount, totalFeedbackCount,
} from './logger';

// ─── Time-saved baseline per fix type (minutes) ───────────────────────────────

const TIME_SAVED_PER_FIX = 8; // conservative: 8 min saved per applied fix

// ─── Metric types ─────────────────────────────────────────────────────────────

export interface ProductivityMetrics {
  fixesSuggested: number;
  fixesApplied: number;
  fixesRejected: number;
  fixesValidated: number;
  totalFeedback: number;
  positiveFeedback: number;
  patternsDetected: number;
  editsTracked: number;

  /** fixesApplied / fixesSuggested  (0–1) */
  fixAdoptionRate: number;
  /** fixesValidated / fixesApplied  (0–1) */
  fixSuccessRate: number;
  /** positiveFeedback / totalFeedback  (0–1) */
  feedbackScore: number;

  /** fixesApplied × TIME_SAVED_PER_FIX */
  estimatedTimeSavedMinutes: number;
}

// ─── Computation ──────────────────────────────────────────────────────────────

export function computeMetrics(events: LoggedEvent[]): ProductivityMetrics {
  const fixesSuggested  = countByType(events, 'fix_suggested');
  const fixesApplied    = countByType(events, 'fix_applied');
  const fixesRejected   = countByType(events, 'fix_rejected');
  const fixesValidated  = countByType(events, 'fix_validated');
  const totalFeedback   = totalFeedbackCount(events);
  const positiveFeedback = positiveFeedbackCount(events);
  const patternsDetected = countByType(events, 'pattern_detected');
  const editsTracked    = countByType(events, 'edit_detected');

  const fixAdoptionRate = fixesSuggested === 0
    ? 0
    : Math.min(1, fixesApplied / fixesSuggested);

  const fixSuccessRate = fixesApplied === 0
    ? 0
    : Math.min(1, fixesValidated / fixesApplied);

  const feedbackScore = totalFeedback === 0
    ? 0.5  // neutral default when no feedback yet
    : Math.min(1, positiveFeedback / totalFeedback);

  const estimatedTimeSavedMinutes = fixesApplied * TIME_SAVED_PER_FIX;

  return {
    fixesSuggested,
    fixesApplied,
    fixesRejected,
    fixesValidated,
    totalFeedback,
    positiveFeedback,
    patternsDetected,
    editsTracked,
    fixAdoptionRate,
    fixSuccessRate,
    feedbackScore,
    estimatedTimeSavedMinutes,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function fmtPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function fmtTime(mins: number): string {
  if (mins < 60) { return `${mins}m`; }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
