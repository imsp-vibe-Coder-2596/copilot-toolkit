/**
 * Fix Suggestion UI - WebView panel that presents a suggested fix with
 * Apply / Ignore / Helpful / Not Helpful action buttons.
 *
 * Consumers call `showFixSuggestion()` with a fix description + code.
 * The panel calls back into extension commands to action the result.
 */
import * as vscode from 'vscode';
import { setPendingFix, PendingFix } from '../commands/applyFix';
import { logEvent } from '../services/logger';

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
// Panel singleton
// ---------------------------------------------------------------------------

let _panel: vscode.WebviewPanel | undefined;

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
    _panel.onDidDispose(() => { _panel = undefined; }, null, context.subscriptions);
  }

  _panel.webview.html = _buildHtml(suggestion);

  _panel.webview.onDidReceiveMessage(async (msg: { command: string }) => {
    switch (msg.command) {

      case 'apply': {
        const pendingFix: PendingFix = {
          id: suggestion.id,
          fixText: suggestion.fixCode,
          description: suggestion.title,
          fileUri: suggestion.fileUri,
          range: suggestion.range,
        };
        setPendingFix(pendingFix);
        await vscode.commands.executeCommand('copilot-toolkit.applyFix');
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
  }, null, context.subscriptions);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
