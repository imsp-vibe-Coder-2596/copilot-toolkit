# Changelog

## [1.2.0] — 2026-05-27

### Added
- **Fix Suggestion UI** (`src/ui/fixSuggestion.ts`) — rich WebView panel with:
  - Side-by-side original vs suggested fix code diff
  - **✅ Apply Fix** — queues the fix and calls `copilot-toolkit.applyFix` immediately
  - **❌ Ignore** — logs `fix_rejected` event and closes the panel
  - **👍 Helpful / 👎 Not Helpful** — logs `feedback` events (positive/negative) for scoring
  - Pattern badge tag on the header
- **`copilot-toolkit.suggestFix`** command:
  - Accessible from the Command Palette and editor right-click context menu (when text is selected)
  - Prompts for fixed code + a short description, then opens the Fix Suggestion panel
- Editor context menu entry for `Copilot Toolkit: Suggest Fix for Selection` (when `editorHasSelection`)

---

## [1.1.0] — 2026-05-27

### Added
- **Productivity Insights Dashboard** (`Copilot Toolkit: Show Productivity Insights`)
  - Real-time WebView panel showing Fix Adoption %, Fix Success %, Time Saved, Issues Detected, Feedback Score, Edits Tracked
  - Skill score ring (0–10) with grade S/A/B/C/D and metric breakdown bars
  - Score formula breakdown panel (adoption × 0.4 + success × 0.3 + feedback × 0.2 + usage × 0.1)
  - Refresh and Reset Data buttons
- **Edit Tracker** — `vscode.workspace.onDidChangeTextDocument` listener with 1.5 s debounce
  - Logs `edit_detected` events per file
  - Automatically runs `detectNewPatterns()` after each settled edit and logs `pattern_detected`
- **Apply Fix command** (`Copilot Toolkit: Apply Suggested Fix`)
  - Programmatic fix application to a target range, or manual paste fallback
  - Logs `fix_applied`, `fix_validated`, `pattern_detected` events
- **Event Logger** (`src/services/logger.ts`) — session + globalState persistence, `flushToState` on deactivate
- **Diff Engine** (`src/services/diffEngine.ts`) — snapshot store, 9 regex patterns (null-check, optional-chaining, try-catch, etc.)
- **Metrics Engine** (`src/services/metricsEngine.ts`) — fix adoption rate, fix success rate, feedback score, estimated time saved
- **Scoring Engine** (`src/services/scoringEngine.ts`) — weighted composite score 0–10 with grade classification

### Changed
- `extension.ts` now activates the edit tracker on startup
- Logger events flushed to `globalState` on extension deactivation
- Version bumped to `1.1.0`

---

All notable changes to **Copilot Toolkit** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2024-01-01

### Added

- **Smart Skill System** — Load and compose multiple AI instruction sets from `.copilot/skills/*.md` and `.github/copilot-instructions.md`.
- **Auto Skill Detection** — Automatically detects your project's tech stack (React, Node, Python, Java, C#, Docker, etc.) and active code patterns (hooks, SQL, auth, async) to pre-select the most relevant skills.
- **Adaptive Learning** — Tracks which skills you use most often and surfaces them at the top of the picker with usage counts. Learns your most-used skill combinations and displays a combo hint.
- **Smart Recommendation UI** — One-click "Use Recommended Skills" based on project + code context, or drop into the full manual picker.
- **Prompt Library** — 5 built-in prompts (Explain, Debug, Performance, Refactor, Pre-PR Review) plus unlimited user-defined prompts in `.copilot/prompts/*.md`.
- **Multi-Step Workflow Mode** — Select multiple prompts and run them as a single sequential request to GitHub Copilot Chat.
- **Skill Preview** — Open a read-only Markdown tab to inspect combined skill instructions before sending.
- **Reset Learning** — `Copilot Toolkit: Reset Learned Preferences` command clears all adaptive learning data.
- **Context Menu** — Right-click any editor to launch Copilot Toolkit directly.
- **Fully configurable** — All paths (`promptFolder`, `skillFile`, `skillsFolder`) and learning toggle (`enableLearning`) configurable via VS Code settings.
- **Framework-agnostic** — Works with any language or stack without hardcoded rules.

---

## [Unreleased]

- Snippet insertion mode (insert AI output directly into editor)
- Custom output format templates
- Per-workspace learning profiles
- GitHub Actions CI/CD integration guides
