# Changelog

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
