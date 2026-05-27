/**
 * Diff engine — stores code snapshots before a suggestion is sent,
 * then compares the before/after to detect whether patterns were adopted.
 */

// ─── Pattern registry ─────────────────────────────────────────────────────────

export interface CodePattern {
  name: string;
  description: string;
  regex: RegExp;
}

export const PATTERNS: CodePattern[] = [
  {
    name: 'null-check',
    description: 'Explicit null / undefined guard added',
    regex: /if\s*\(\s*\w+\s*(?:===?\s*null|===?\s*undefined|!==?\s*null|!==?\s*undefined|\?\?|==\s*null)\s*\)/,
  },
  {
    name: 'optional-chaining',
    description: 'Optional chaining operator used',
    regex: /\w+\?\.\w+/,
  },
  {
    name: 'nullish-coalescing',
    description: 'Nullish coalescing operator (??) used',
    regex: /\?\?/,
  },
  {
    name: 'safe-attribute-access',
    description: 'Safe getAttribute with null check',
    regex: /if\s*\(.*getAttribute/,
  },
  {
    name: 'try-catch-added',
    description: 'Try-catch error handling added',
    regex: /try\s*\{[\s\S]*?\}\s*catch\s*\(/,
  },
  {
    name: 'async-await',
    description: 'async/await pattern used',
    regex: /\basync\b.*\bawait\b/,
  },
  {
    name: 'control-validation',
    description: 'Input validation guard at function entry',
    regex: /if\s*\(!?\s*\w+\s*\)\s*(?:return|throw)/,
  },
  {
    name: 'early-return',
    description: 'Early return / guard clause pattern',
    regex: /if\s*\([^)]+\)\s*\{\s*return\s/,
  },
  {
    name: 'const-assertion',
    description: 'Const used instead of let/var for immutability',
    regex: /\bconst\s+\w+\s*=/,
  },
];

// ─── Snapshot store ───────────────────────────────────────────────────────────

const snapshots = new Map<string, string>(); // key = fileUri string

/** Store the current content of a file before a suggestion is sent. */
export function storeSnapshot(fileUri: string, content: string): void {
  snapshots.set(fileUri, content);
}

/** Retrieve the stored snapshot for a file. */
export function getSnapshot(fileUri: string): string | undefined {
  return snapshots.get(fileUri);
}

/** Clear a snapshot after validation is complete. */
export function clearSnapshot(fileUri: string): void {
  snapshots.delete(fileUri);
}

// ─── Diff logic ───────────────────────────────────────────────────────────────

export interface DiffResult {
  hasChanges: boolean;
  linesAdded: number;
  linesRemoved: number;
  charDelta: number;
}

export function computeDiff(before: string, after: string): DiffResult {
  const beforeLines = before.split('\n');
  const afterLines  = after.split('\n');

  const beforeSet = new Set(beforeLines);
  const afterSet  = new Set(afterLines);

  const linesAdded   = afterLines.filter(l => !beforeSet.has(l)).length;
  const linesRemoved = beforeLines.filter(l => !afterSet.has(l)).length;

  return {
    hasChanges: before !== after,
    linesAdded,
    linesRemoved,
    charDelta: after.length - before.length,
  };
}

// ─── Pattern detection ────────────────────────────────────────────────────────

export interface PatternMatch {
  pattern: CodePattern;
  /** true = pattern newly appeared (was absent before, present after) */
  isNew: boolean;
}

/**
 * Detect which registered patterns are present in `code`.
 * If `beforeCode` is provided, also flags patterns that are newly added.
 */
export function detectPatterns(code: string, beforeCode?: string): PatternMatch[] {
  const results: PatternMatch[] = [];
  for (const pattern of PATTERNS) {
    const presentNow   = pattern.regex.test(code);
    const presentBefore = beforeCode ? pattern.regex.test(beforeCode) : false;
    if (presentNow) {
      results.push({ pattern, isNew: !presentBefore });
    }
  }
  return results;
}

/**
 * Compares before/after snapshots and returns patterns that were newly added.
 * Returns empty array if no snapshot exists.
 */
export function detectNewPatterns(fileUri: string, afterCode: string): PatternMatch[] {
  const before = getSnapshot(fileUri);
  if (!before) { return detectPatterns(afterCode).map(m => ({ ...m, isNew: false })); }
  return detectPatterns(afterCode, before).filter(m => m.isNew);
}

/**
 * Checks whether a specific fix suggestion (identified by its content snippet)
 * appears in the updated code.
 */
export function isSuggestionAdopted(suggestion: string, updatedCode: string): boolean {
  // Simple heuristic: take the first non-trivial line of the suggestion and look for it
  const lines = suggestion.split('\n').map(l => l.trim()).filter(l => l.length > 5);
  if (lines.length === 0) { return false; }
  return lines.slice(0, 3).some(line => updatedCode.includes(line));
}
