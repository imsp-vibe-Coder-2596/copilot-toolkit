/**
 * Fix Suggestion UI - WebView panel that presents a suggested fix with
 * Apply / Ignore / Helpful / Not Helpful action buttons.
 *
 * Consumers call `showFixSuggestion()` with a fix description + code.
 * The panel calls back into extension commands to action the result.
 */
import * as vscode from 'vscode';
import { logEvent } from '../services/logger';
import { storeSnapshot, detectNewPatterns } from '../services/diffEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FixSuggestion {
  id: string;
  title: string;
  description: string;
  originalCode: string;
  fixCode: string;
  fileUri: string;
  range?: vscode.Range;
  patternName?: string;
}

// ---------------------------------------------------------------------------
// Panel singleton + listener management
// ---------------------------------------------------------------------------

let _panel: vscode.WebviewPanel | undefined;
let _msgDisposable: vscode.Disposable | undefined;   // current onDidReceiveMessage handle

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show a Fix Suggestion panel for the given suggestion.
 * Replaces any existing panel.
 */
export function showFixSuggestion(
  suggestion: FixSuggestion,
  context: vscode.ExtensionContext,
): void {
  // Log that we are presenting this fix
  logEvent('fix_suggested', {
    fixId: suggestion.id,
    fileName: suggestion.fileUri.split(/[\\/]/).pop(),
    patternName: suggestion.patternName,
    meta: { title: suggestion.title },
  });

  if (_panel) {
    _panel.reveal(vscode.ViewColumn.Beside);
  } else {
    _panel = vscode.window.createWebviewPanel(
      'copilotToolkitFixSuggestion',
      '🔧 Copilot Toolkit — Fix Suggestion',
      vscode.ViewColumn.Beside,
      { enableScripts: true },
    );
    _panel.onDidDispose(() => {
      _msgDisposable?.dispose();
      _msgDisposable = undefined;
      _panel = undefined;
    }, null, context.subscriptions);
  }

  _panel.webview.html = _buildHtml(suggestion);

  // ── FIX: always dispose the previous listener before adding a new one ──
  // Without this, each call to showFixSuggestion stacks another listener.
  // When Apply is clicked, all stacked listeners fire — the first clears
  // _pendingFix so the next sees undefined and falls back to the input box.
  _msgDisposable?.dispose();
  _msgDisposable = _panel.webview.onDidReceiveMessage(
    async (msg: { command: string }) => {
      switch (msg.command) {

        case 'apply': {
          await _applyFixDirectly(suggestion);
          _panel?.dispose();
          break;
        }

        case 'ignore': {
          logEvent('fix_rejected', {
            fixId: suggestion.id,
            fileName: suggestion.fileUri.split(/[\\/]/).pop(),
            patternName: suggestion.patternName,
          });
          vscode.window.showInformationMessage('Copilot Toolkit: Fix ignored.');
          _panel?.dispose();
          break;
        }

        case 'feedback_positive': {
          logEvent('feedback', {
            fixId: suggestion.id,
            feedbackPositive: true,
            patternName: suggestion.patternName,
          });
          vscode.window.showInformationMessage('Copilot Toolkit: Thanks for the feedback! 👍');
          _updateFeedbackState('positive');
          break;
        }

        case 'feedback_negative': {
          logEvent('feedback', {
            fixId: suggestion.id,
            feedbackPositive: false,
            patternName: suggestion.patternName,
          });
          vscode.window.showInformationMessage('Copilot Toolkit: Feedback recorded. 👎');
          _updateFeedbackState('negative');
          break;
        }
      }
    },
    null,
    context.subscriptions,
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Applies the fix directly — no command roundtrip, no stale _pendingFix state.
 *
 * Key fixes vs the old approach:
 *  1. Opens the document explicitly by URI so the correct file is always targeted.
 *  2. Shows it in ViewColumn.One so it is the active editor and edits land correctly.
 *  3. Re-reads the live selection AFTER the editor is focused — avoids stale Range.
 *  4. Falls back to the stored range only when the live selection is empty.
 */
async function _applyFixDirectly(suggestion: FixSuggestion): Promise<void> {
  // 1. Open target document
  let document: vscode.TextDocument;
  try {
    document = await vscode.workspace.openTextDocument(vscode.Uri.parse(suggestion.fileUri));
  } catch {
    vscode.window.showErrorMessage('Copilot Toolkit: Could not open the target file.');
    return;
  }

  // 2. Show it as the active editor in column 1 so edits are unambiguous
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One, false);

  // 3. Determine target range:
  //    - prefer the live editor selection (user may have adjusted it after opening the panel)
  //    - fall back to the stored range from when the suggestion was created
  //    - if neither, warn and abort
  let targetRange: vscode.Range | vscode.Selection;
  if (!editor.selection.isEmpty) {
    targetRange = editor.selection;
  } else if (suggestion.range && !suggestion.range.isEmpty) {
    targetRange = suggestion.range;
  } else {
    vscode.window.showWarningMessage(
      'Copilot Toolkit: No selection found. Please re-select the code to replace, then click Apply Fix again.'
    );
    return;
  }

  // 4. Snapshot before editing (for diff engine)
  storeSnapshot(suggestion.fileUri, document.getText());

  // 5. Apply the edit
  const success = await editor.edit(editBuilder => {
    editBuilder.replace(targetRange, suggestion.fixCode);
  });

  if (!success) {
    vscode.window.showErrorMessage('Copilot Toolkit: Edit failed — the document may have changed. Please try again.');
    return;
  }

  // 6. Log and confirm
  logEvent('fix_applied', {
    fixId: suggestion.id,
    fileName: document.fileName.split(/[\\/]/).pop(),
    languageId: document.languageId,
    meta: { description: suggestion.title },
  });

  vscode.window.showInformationMessage(`✅ Copilot Toolkit: Fix applied — "${suggestion.title}"`);

  // 7. Validate after document settles
  setTimeout(() => {
    const updatedText = document.getText();
    const newPatterns = detectNewPatterns(suggestion.fileUri, updatedText);
    for (const match of newPatterns) {
      logEvent('pattern_detected', {
        patternName: match.pattern.name,
        meta: { description: match.pattern.description },
      });
    }
    const isValidated =
      newPatterns.length > 0 ||
      suggestion.fixCode.split('\n')
        .filter(l => l.trim().length > 4)
        .some(line => updatedText.includes(line.trim()));

    if (isValidated) {
      logEvent('fix_validated', {
        fixId: suggestion.id,
        meta: { patternsFound: newPatterns.map(m => m.pattern.name) },
      });
    }
  }, 800);
}

function _updateFeedbackState(state: 'positive' | 'negative'): void {
  if (!_panel) { return; }
  _panel.webview.postMessage({ command: 'feedbackRecorded', state });
}

function _escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _buildHtml(s: FixSuggestion): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Fix Suggestion</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:      #1e1e2e;
    --surface: #181825;
    --card:    #313244;
    --border:  #45475a;
    --text:    #cdd6f4;
    --subtext: #a6adc8;
    --green:   #a6e3a1;
    --red:     #f38ba8;
    --yellow:  #f9e2af;
    --accent:  #cba6f7;
  }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    padding: 24px;
    line-height: 1.5;
  }

  /* Header */
  .header { margin-bottom: 20px; }
  .header h1 { font-size: 1.2rem; font-weight: 700; color: var(--accent); }
  .header p  { font-size: 0.85rem; color: var(--subtext); margin-top: 4px; }
  .pattern-tag {
    display: inline-block;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.75rem;
    padding: 2px 8px;
    color: var(--yellow);
    margin-top: 6px;
  }

  /* Code diff */
  .diff-section { margin-bottom: 20px; }
  .diff-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--subtext);
    margin-bottom: 6px;
    font-weight: 600;
  }
  pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .original pre { border-left: 3px solid var(--red); }
  .fixed   pre  { border-left: 3px solid var(--green); }

  /* Action buttons */
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 24px;
  }
  button {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 20px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: background 0.15s, transform 0.1s;
    background: var(--card);
    color: var(--text);
  }
  button:hover  { background: var(--border); }
  button:active { transform: scale(0.97); }
  .btn-apply  { background: var(--green);  color: #1e1e2e; border-color: var(--green); }
  .btn-apply:hover  { background: #81d4a0; }
  .btn-ignore { background: var(--red);    color: #1e1e2e; border-color: var(--red); }
  .btn-ignore:hover { background: #e07080; }
  .btn-disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

  /* Feedback row */
  .feedback-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .feedback-label { color: var(--subtext); font-size: 0.85rem; flex: 1; }
  .feedback-msg   { font-size: 0.85rem; color: var(--green); display: none; }

  /* Divider */
  .divider { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
</style>
</head>
<body>

<div class="header">
  <h1>🔧 Fix Suggestion</h1>
  <p>${_escape(s.description)}</p>
  ${s.patternName ? `<span class="pattern-tag">Pattern: ${_escape(s.patternName)}</span>` : ''}
</div>

<div class="diff-section original">
  <div class="diff-label">❌ Original Code</div>
  <pre>${_escape(s.originalCode)}</pre>
</div>

<div class="diff-section fixed">
  <div class="diff-label">✅ Suggested Fix</div>
  <pre>${_escape(s.fixCode)}</pre>
</div>

<div class="actions">
  <button class="btn-apply"  id="btn-apply"  onclick="applyFix()">✅ Apply Fix</button>
  <button class="btn-ignore" id="btn-ignore" onclick="ignoreFix()">❌ Ignore</button>
</div>

<hr class="divider"/>

<div class="feedback-row">
  <span class="feedback-label">Was this suggestion helpful?</span>
  <button id="btn-yes" onclick="sendFeedback(true)">👍 Helpful</button>
  <button id="btn-no"  onclick="sendFeedback(false)">👎 Not Helpful</button>
  <span class="feedback-msg" id="feedback-msg">Thanks for your feedback!</span>
</div>

<script>
  const vscode = acquireVsCodeApi();

  function applyFix() {
    document.getElementById('btn-apply').classList.add('btn-disabled');
    document.getElementById('btn-ignore').classList.add('btn-disabled');
    vscode.postMessage({ command: 'apply' });
  }

  function ignoreFix() {
    document.getElementById('btn-apply').classList.add('btn-disabled');
    document.getElementById('btn-ignore').classList.add('btn-disabled');
    vscode.postMessage({ command: 'ignore' });
  }

  function sendFeedback(positive) {
    document.getElementById('btn-yes').classList.add('btn-disabled');
    document.getElementById('btn-no').classList.add('btn-disabled');
    vscode.postMessage({ command: positive ? 'feedback_positive' : 'feedback_negative' });
  }

  // Receive messages from extension
  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.command === 'feedbackRecorded') {
      document.getElementById('feedback-msg').style.display = 'inline';
    }
  });
</script>
</body>
</html>`;
}
