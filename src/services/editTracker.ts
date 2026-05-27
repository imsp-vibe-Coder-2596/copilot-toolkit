/**
 * Edit Tracker — listens for document changes, debounces, and logs
 * `edit_detected` events + detects new code patterns via diffEngine.
 */
import * as vscode from 'vscode';
import { logEvent } from './logger';
import { storeSnapshot, detectNewPatterns } from './diffEngine';

// ─── Config ───────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 1500;      // wait 1.5 s after last keystroke
const MIN_CHANGE_CHARS = 5;    // ignore tiny whitespace-only edits

// ─── Debounce map: fileUri → timer handle ────────────────────────────────────

const _debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Tracker activation ───────────────────────────────────────────────────────

/**
 * Registers the `onDidChangeTextDocument` listener.
 * Call once from `activate()` and push the returned Disposable to subscriptions.
 */
export function activateEditTracker(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const disposable = vscode.workspace.onDidChangeTextDocument(event => {
    const { document, contentChanges } = event;

    // Skip non-user-triggered saves, output channels, etc.
    if (document.uri.scheme !== 'file') { return; }

    // Measure total characters changed
    const totalCharsChanged = contentChanges.reduce(
      (sum, c) => sum + c.text.length + c.rangeLength,
      0,
    );
    if (totalCharsChanged < MIN_CHANGE_CHARS) { return; }

    const fileUri = document.uri.toString();

    // Debounce per file
    const existing = _debounceMap.get(fileUri);
    if (existing) { clearTimeout(existing); }

    const handle = setTimeout(() => {
      _debounceMap.delete(fileUri);
      _onEditSettled(document);
    }, DEBOUNCE_MS);

    _debounceMap.set(fileUri, handle);
  });

  // Ensure all pending timers are cleared when extension deactivates
  context.subscriptions.push({
    dispose() {
      for (const handle of _debounceMap.values()) { clearTimeout(handle); }
      _debounceMap.clear();
    },
  });

  return disposable;
}

// ─── Settled-edit handler ────────────────────────────────────────────────────

function _onEditSettled(document: vscode.TextDocument): void {
  const fileUri  = document.uri.toString();
  const text     = document.getText();
  const fileName = document.fileName.split(/[\\/]/).pop();

  // Log the edit
  logEvent('edit_detected', {
    fileName,
    languageId: document.languageId,
  });

  // Detect any new patterns introduced since last snapshot
  const newPatterns = detectNewPatterns(fileUri, text);
  for (const match of newPatterns) {
    logEvent('pattern_detected', {
      fileName,
      languageId: document.languageId,
      patternName: match.pattern.name,
      meta: { description: match.pattern.description },
    });
  }

  // Update the snapshot for future diffs
  storeSnapshot(fileUri, text);
}
