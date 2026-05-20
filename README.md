# Copilot Toolkit — AI Code Review & Prompt Automation

> **Supercharge GitHub Copilot** with smart skill-driven code review, multi-step workflow automation, dynamic prompt libraries, auto skill detection, and adaptive AI recommendations.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=your-publisher-id.copilot-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.90.0-blueviolet.svg)](https://code.visualstudio.com/)

---

## Overview

**Copilot Toolkit** is a VS Code extension that adds a powerful orchestration layer on top of GitHub Copilot Chat. Instead of typing raw questions, you compose **skill instruction sets** (your engineering standards) with **reusable prompts** (your review tasks) and send them together as structured, high-quality requests.

It works with **any language, framework, or stack** — the extension reads your project and open file to automatically recommend the right skills, learns your preferences over time, and lets you build multi-step AI workflows with just a few clicks.

---

## Features

### 🧠 Smart Skill System
Define your engineering standards as Markdown files. The extension composes them into a rich instruction context sent to Copilot before every request.

- **Default skill** from `.github/copilot-instructions.md` (respects your existing Copilot instructions)
- **Custom skill sets** from `.copilot/skills/*.md` (security, performance, frontend, backend, etc.)
- **Multi-skill merge** — select multiple skills; each is labelled and combined with a priority header

### ⚡ Auto Skill Detection
The extension scans your project and active file to detect:

| Signal | Detected From |
|--------|--------------|
| React / Next.js / Vue / Angular | `package.json` dependencies |
| Node.js server (Express, Fastify…) | `package.json` dependencies |
| TypeScript | `tsconfig.json` |
| Python | `requirements.txt`, `pyproject.toml` |
| Java | `pom.xml` |
| C# | `*.csproj` |
| Docker | `Dockerfile`, `docker-compose.yml` |
| React hooks | `useState`, `useEffect` in active file |
| SQL / database queries | SQL patterns in active file |
| Auth / credentials | `password`, `token`, `jwt` patterns |
| API / HTTP calls | `fetch`, `axios`, `XMLHttpRequest` |

### 🎯 Adaptive Learning
Copilot Toolkit remembers which skills you choose and learns your patterns:

- Tracks individual skill usage counts
- Detects frequently used skill combinations
- Surfaces a "You frequently use: X + Y" hint in the recommendation UI
- Boosts frequently used skills to the top of the picker

> **Reset anytime** — run `Copilot Toolkit: Reset Learned Preferences` from the Command Palette.

### 📂 Dynamic Prompt Library
5 built-in prompts are always available, plus unlimited user-defined prompts:

| Built-in Prompt | What it does |
|----------------|-------------|
| ⚡ Explain Component | Purpose, data flow, side effects, dependencies |
| ⚡ Debug Issue | Root cause analysis + concrete fix steps |
| ⚡ Performance Analysis | Bottlenecks, complexity, memory, optimisations |
| ⚡ Safe Refactor | Clean code without behaviour change |
| ⚡ Pre-PR Review | Severity-rated issues before merging |

Add your own by dropping `.md` files into `.copilot/prompts/`.

### 🔄 Multi-Step Workflow Mode
Select multiple prompts and run them as a **single sequential request** to Copilot Chat. Perfect for thorough reviews that cover multiple angles at once (e.g. Debug + Performance + Security in one shot).

### 👁 Skill Preview
Before sending your request, open a read-only Markdown tab to inspect the combined skill instructions — so you always know exactly what context Copilot is receiving.

---

## Installation

### From the Marketplace
1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions panel)
3. Search for **Copilot Toolkit**
4. Click **Install**

### From VSIX (manual)
```bash
code --install-extension copilot-toolkit-1.0.0.vsix
```

**Prerequisite:** GitHub Copilot must be installed and active in your VS Code.

---

## Usage

### Quick Start
1. Open any file in your project
2. Press `Ctrl+Shift+P` → **Copilot Toolkit**  
   _or_ right-click in the editor → **Copilot Toolkit**
3. Choose a mode: **Single Prompt** or **Multi-Step Workflow**
4. Review the smart skill recommendation (or customize manually)
5. Pick a prompt
6. Copilot Chat opens with your structured request

### Keyboard Shortcut (optional)
Add to your `keybindings.json`:
```json
{
  "key": "ctrl+shift+alt+c",
  "command": "copilot-toolkit.open"
}
```

---

## Skills Setup

### Default Skill
Create `.github/copilot-instructions.md` in your project root. This file is automatically used as the default skill and also feeds GitHub Copilot's native instruction system.

```markdown
# My Engineering Standards

- Always prefer immutable data structures
- All async functions must handle errors explicitly
- Prefer composition over inheritance
- All public APIs must have JSDoc comments
```

### Additional Skills
Create `.copilot/skills/` in your project root and add `.md` files:

```
.copilot/
└── skills/
    ├── security.md
    ├── performance.md
    ├── frontend.md
    └── database.md
```

**Example: `security.md`**
```markdown
# Security Review Standards

- Validate and sanitize all user inputs before processing
- Never log sensitive data (passwords, tokens, PII)
- Use parameterized queries — never string-concatenated SQL
- All auth tokens must have expiry and be rotated after use
- Check OWASP Top 10 patterns: injection, XSS, CSRF, broken auth
```

---

## Prompts Setup

Create `.copilot/prompts/` and add `.md` files for custom prompts:

```
.copilot/
└── prompts/
    ├── api-review.md
    ├── accessibility.md
    └── migration-check.md
```

**Example: `api-review.md`**
```markdown
Review this API endpoint based on the provided engineering instructions.
Check: input validation, authentication, authorization, rate limiting,
error response format, HTTP status codes, and logging.
```

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `copilotToolkit.promptFolder` | `.copilot/prompts` | Path to user prompt `.md` files |
| `copilotToolkit.skillFile` | `.github/copilot-instructions.md` | Path to default skill file |
| `copilotToolkit.skillsFolder` | `.copilot/skills` | Path to additional skill `.md` files |
| `copilotToolkit.enableLearning` | `true` | Enable adaptive learning |

All paths are relative to the workspace root.

**Example `settings.json`:**
```json
{
  "copilotToolkit.skillsFolder": ".ai/skills",
  "copilotToolkit.promptFolder": ".ai/prompts",
  "copilotToolkit.enableLearning": true
}
```

---

## Folder Structure

```
your-project/
├── .github/
│   └── copilot-instructions.md    ← default skill
└── .copilot/
    ├── skills/
    │   ├── security.md
    │   ├── performance.md
    │   └── frontend.md
    └── prompts/
        ├── api-review.md
        └── migration-check.md
```

---

## Commands

| Command | Description |
|---------|-------------|
| `Copilot Toolkit` | Open the main workflow picker |
| `Copilot Toolkit: Reset Learned Preferences` | Clear all adaptive learning data |

---

## How It Works

```
You trigger Copilot Toolkit
        ↓
Auto-detect project tech stack + active code patterns
        ↓
Smart recommendation: "Use Recommended Skills" or "Customize Manually"
        ↓
Pick prompt(s) — single or multi-step workflow
        ↓
Build structured prompt: [Header] + [Skills] + [Task] + [Code]
        ↓
Open GitHub Copilot Chat with the full prompt
        ↓
Adaptive learning records your skill choices
```

---

## Requirements

- **VS Code** `^1.90.0`
- **GitHub Copilot** extension (installed and authenticated)

---

## License

[MIT](LICENSE) © 2024 Copilot Toolkit Contributors

---

## Contributing

Issues, feature requests, and PRs are welcome at the [GitHub repository](https://github.com/your-username/copilot-toolkit).
