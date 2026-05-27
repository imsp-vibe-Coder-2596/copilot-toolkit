/**
 * Scoring engine — produces a 0–10 skill score from productivity metrics.
 *
 * Formula:
 *   score = (fixAdoptionRate * 0.4)
 *         + (fixSuccessRate  * 0.3)
 *         + (feedbackScore   * 0.2)
 *         + (usageWeight     * 0.1)
 *   scaled to 0–10
 */
import { ProductivityMetrics } from './metricsEngine';

export interface SkillScoreResult {
  score: number;          // 0.0 – 10.0
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  label: string;
  breakdown: {
    adoptionContrib:  number;
    successContrib:   number;
    feedbackContrib:  number;
    usageContrib:     number;
  };
}

/** Normalises total events to a 0-1 "usage weight" (saturates at 50 events). */
function usageWeight(metrics: ProductivityMetrics): number {
  const total = metrics.fixesSuggested + metrics.fixesApplied +
                metrics.patternsDetected + metrics.editsTracked;
  return Math.min(1, total / 50);
}

export function computeSkillScore(metrics: ProductivityMetrics): SkillScoreResult {
  const adoption  = metrics.fixAdoptionRate;
  const success   = metrics.fixSuccessRate;
  const feedback  = metrics.feedbackScore;
  const usage     = usageWeight(metrics);

  const adoptionContrib  = adoption  * 0.4;
  const successContrib   = success   * 0.3;
  const feedbackContrib  = feedback  * 0.2;
  const usageContrib     = usage     * 0.1;

  const raw   = adoptionContrib + successContrib + feedbackContrib + usageContrib; // 0–1
  const score = Math.round(raw * 100) / 10; // 0.0–10.0

  let grade: SkillScoreResult['grade'];
  let label: string;
  if (score >= 9)      { grade = 'S'; label = 'Exceptional'; }
  else if (score >= 7) { grade = 'A'; label = 'Strong';      }
  else if (score >= 5) { grade = 'B'; label = 'Good';        }
  else if (score >= 3) { grade = 'C'; label = 'Developing';  }
  else                 { grade = 'D'; label = 'Early Stage';  }

  return {
    score,
    grade,
    label,
    breakdown: { adoptionContrib, successContrib, feedbackContrib, usageContrib },
  };
}
