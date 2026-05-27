/**
 * Apply Fix command — replaces the user's current selection with
 * a suggested fix, then logs fix_applied and triggers validation.
 */
import * as vscode from 'vscode';
import { logEvent } from '../services/logger';
import { storeSnapshot, detectNewPatterns } from '../services/diffEngine';

// ─── Active fix store ─────────────────────────────────────────────────────────

export interface PendingFix {
  id: string;
  fixText: string;       // the replacement code
  description: string;   // human-readable label
  fileUri: string;       // document URI string
  range?: vscode.Range;  // target range (optional; falls back to selection)
}

let _pendingFix: PendingFix | undefined;

/** Register a fix so it can be applied via the command. */
export function setPendingFix(fix: PendingFix): void {
  _pendingFix = fix;
}

/** Retrieve and optionally clear the pending fix. */
export function getPendingFix(clear = false): PendingFix | undefined {
  const fix = _pendingFix;
  if (clear) { _pendingFix = undefined; }
  return fix;
}

// ─── Command handler ──────────────────────────────────────────────────────────

/**
 * Registered as command: copilot-toolkit.applyFix
 *
 * If a PendingFix is queued:
 *   - Opens the target document
 *   - Replaces the specified range (or current selection) with fixText
 *   - Logs fix_applied
 *   - Triggers post-apply validation
 *
 * If no fix is queued, prompts the user to paste one manually.
 */
export async function applyFixCommand(): Promise<void> {
  const fix = getPendingFix(true);

  if (!fix) {
    // Fallback: apply a manually typed fix to the current selection
    await applyManualFix();
    return;
  }

  // Find the target document
  let document: vscode.TextDocument;
  try {
    document = await vscode.workspace.openTextDocument(vscode.Uri.parse(fix.fileUri));
  } catch {
    vscode.window.showErrorMessage('Copilot Toolkit: Could not open the target file for fix application.');
    return;
  }

  const editor = await vscode.window.showTextDocument(document);

  // Determine target range
  const targetRange = fix.range ?? editor.selection;
  if (targetRange.isEmpty && !fix.range) {
    vscode.window.showWarningMessage('Copilot Toolkit: No selection found. Please select the code to replace.');
    return;
  }

  // Snapshot before editing
  storeSnapshot(fix.fileUri, document.getText());

  // Apply the edit
  const success = await editor.edit(editBuilder => {
    editBuilder.replace(targetRange, fix.fixText);
  });

  if (!success) {
    vscode.window.showErrorMessage('Copilot Toolkit: Failed to apply fix — the document may have changed.');
    return;
  }

  // Log the event
  logEvent('fix_applied', {
    fixId: fix.id,
    fileName: document.fileName.split(/[\\/]/).pop(),
    languageId: document.languageId,
    meta: { description: fix.description },
  });

  vscode.window.showInformationMessage(`✅ Copilot Toolkit: Fix applied — "${fix.description}"`);

  // Trigger validation after a short delay (let the document settle)
  setTimeout(() => validateAppliedFix(fix, document.getText()), 800);
}

// ─── Manual fix fallback ──────────────────────────────────────────────────────

async function applyManualFix(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Copilot Toolkit: No active editor.');
    return;
  }
  if (editor.selection.isEmpty) {
    vscode.window.showWarningMessage('Copilot Toolkit: Select the code you want to replace first.');
    return;
  }

  const fixText = await vscode.window.showInputBox({
    title: 'Copilot Toolkit — Apply Fix',
    prompt: 'Paste the replacement code',
    placeHolder: 'Replacement code…',
    ignoreFocusOut: true,
  });
  if (!fixText) { return; }

  const fileUri = editor.document.uri.toString();
  storeSnapshot(fileUri, editor.document.getText());

  const success = await editor.edit(eb => eb.replace(editor.selection, fixText));
  if (success) {
    logEvent('fix_applied', {
      fileName: editor.document.fileName.split(/[\\/]/).pop(),
      languageId: editor.document.languageId,
      meta: { source: 'manual' },
    });
    vscode.window.showInformationMessage('✅ Copilot Toolkit: Manual fix applied.');
    setTimeout(() => validateAppliedFix(
      { id: 'manual', fixText, description: 'Manual fix', fileUri, range: undefined },
      editor.document.getText()
    ), 800);
  } else {
    vscode.window.showErrorMessage('Copilot Toolkit: Could not apply fix.');
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateAppliedFix(fix: PendingFix, updatedCode: string): void {
  // Detect new patterns introduced by the fix
  const newPatterns = detectNewPatterns(fix.fileUri, updatedCode);

  for (const match of newPatterns) {
    logEvent('pattern_detected', {
      patternName: match.pattern.name,
      meta: { description: match.pattern.description },
    });
  }

  // Mock validation: consider fix validated if any new pattern appeared
  // OR the fix text itself is present in the updated code
  const isValidated = newPatterns.length > 0 ||
    fix.fixText.split('\n').filter(l => l.trim().length > 4)
      .some(line => updatedCode.includes(line.trim()));

  if (isValidated) {
    logEvent('fix_validated', {
      fixId: fix.id,
      meta: {
        patternsFound: newPatterns.map(m => m.pattern.name),
      },
    });
  }
}
