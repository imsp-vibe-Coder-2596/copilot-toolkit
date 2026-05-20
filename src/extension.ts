import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ─── Prompt item type ─────────────────────────────────────────────────────────

interface PromptItem extends vscode.QuickPickItem {
  body: string;
  source: 'builtin' | 'file';
}

// ─── Built-in prompts ─────────────────────────────────────────────────────────

function getBuiltInPrompts(): PromptItem[] {
  return [
    {
      label: '⚡ Built-in: Explain Component',
      description: 'Purpose · Data flow · Side effects · Dependencies',
      source: 'builtin',
      body: 'Explain the following code clearly based on the provided engineering instructions. Cover: purpose, inputs and outputs, data flow, side effects, dependencies, and any non-obvious behaviour a developer should know about.',
    },
    {
      label: '⚡ Built-in: Debug Issue',
      description: 'Root cause analysis + fix steps',
      source: 'builtin',
      body: 'Analyse the following code and identify all bugs and issues based on the provided engineering instructions. For each problem: state the root cause, explain why it occurs, provide a concrete fix, and flag any remaining edge cases.',
    },
    {
      label: '⚡ Built-in: Performance Analysis',
      description: 'Bottlenecks · Complexity · Memory · Optimisations',
      source: 'builtin',
      body: 'Analyse the following code for performance issues based on the provided engineering instructions. For every issue: describe the impact, rate its severity (high / medium / low), and provide an optimised alternative implementation.',
    },
    {
      label: '⚡ Built-in: Safe Refactor',
      description: 'Clean code · Readability · No behaviour change',
      source: 'builtin',
      body: 'Refactor the following code to improve quality WITHOUT changing observable behaviour, following the provided engineering instructions. Present the refactored version with a brief bullet list explaining each change made.',
    },
    {
      label: '⚡ Built-in: Pre-PR Review',
      description: 'Code quality · Error handling · Best practices',
      source: 'builtin',
      body: 'Review this code based on the provided engineering instructions before it is merged via Pull Request. For each issue found, state: severity (critical / warning / suggestion), location, and a recommended fix.',
    },
  ];
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getConfigPath(key: 'promptFolder' | 'skillFile' | 'skillsFolder'): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) { return undefined; }
  const cfg = vscode.workspace.getConfiguration('copilotToolkit');
  const relative: string = cfg.get(key) ?? '';
  return path.join(root, relative);
}

// ─── Skill loader / picker / merger ──────────────────────────────────────────

const DEFAULT_SKILL =
  'You are a senior software engineer. Evaluate the code for correctness, maintainability, and performance.';

interface SkillItem extends vscode.QuickPickItem {
  content: string;
  source: 'default' | 'file';
  skillName: string;
}

// ─── Auto-detection ───────────────────────────────────────────────────────────

interface DetectionSignal {
  skill: string;
  weight: number; // 2 = strong, 1 = weak
  reason: string;
}

interface SkillScore {
  skillName: string;
  score: number;
  reasons: string[];
  confidence: 'high' | 'medium' | 'low';
}

/** Scans project structure files and returns weighted detection signals. */
function detectProjectContext(): DetectionSignal[] {
  const signals: DetectionSignal[] = [];
  const root = getWorkspaceRoot();
  if (!root) { return signals; }

  // package.json
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps: Record<string, string> = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      const names = Object.keys(deps).map(k => k.toLowerCase());

      if (names.some(n => n.includes('react') || n.includes('next'))) {
        signals.push({ skill: 'frontend', weight: 2, reason: 'React/Next.js in package.json' });
        signals.push({ skill: 'performance', weight: 1, reason: 'React project (render optimisation matters)' });
      }
      if (names.some(n => n.includes('vue') || n.includes('angular') || n.includes('svelte'))) {
        signals.push({ skill: 'frontend', weight: 2, reason: 'Frontend framework in package.json' });
      }
      if (names.some(n => n.includes('express') || n.includes('fastify') || n.includes('koa') || n.includes('hapi'))) {
        signals.push({ skill: 'backend', weight: 2, reason: 'Node.js server framework in package.json' });
        signals.push({ skill: 'security', weight: 1, reason: 'Server-side code requires security review' });
      }
      if (names.some(n => n.includes('jest') || n.includes('vitest') || n.includes('mocha'))) {
        signals.push({ skill: 'code-quality', weight: 1, reason: 'Test framework in package.json' });
      }
      if (names.some(n => n.includes('prisma') || n.includes('sequelize') || n.includes('typeorm') || n.includes('mongoose'))) {
        signals.push({ skill: 'database', weight: 2, reason: 'ORM/database library in package.json' });
        signals.push({ skill: 'performance', weight: 1, reason: 'Database queries need performance review' });
      }
    } catch { /* ignore */ }
  }

  // tsconfig.json → typescript
  if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
    signals.push({ skill: 'typescript', weight: 2, reason: 'tsconfig.json detected' });
    signals.push({ skill: 'code-quality', weight: 1, reason: 'TypeScript project benefits from type safety review' });
  }

  // .csproj → csharp
  try {
    if (fs.readdirSync(root).some(f => f.endsWith('.csproj'))) {
      signals.push({ skill: 'csharp', weight: 2, reason: '.csproj file detected' });
    }
  } catch { /* ignore */ }

  // python
  if (fs.existsSync(path.join(root, 'requirements.txt')) || fs.existsSync(path.join(root, 'pyproject.toml'))) {
    signals.push({ skill: 'python', weight: 2, reason: 'Python project files detected' });
  }

  // java
  if (fs.existsSync(path.join(root, 'pom.xml'))) {
    signals.push({ skill: 'java', weight: 2, reason: 'pom.xml detected' });
  }

  // Dockerfile / docker-compose
  if (fs.existsSync(path.join(root, 'Dockerfile')) || fs.existsSync(path.join(root, 'docker-compose.yml'))) {
    signals.push({ skill: 'backend', weight: 1, reason: 'Docker configuration detected' });
    signals.push({ skill: 'security', weight: 1, reason: 'Container setup benefits from security review' });
  }

  return signals;
}

/** Scans active file text and returns weighted detection signals. */
function detectCodeContext(code: string): DetectionSignal[] {
  const signals: DetectionSignal[] = [];

  // React hooks / frontend patterns
  if (/\buseEffect\b|\buseState\b|\buseCallback\b|\buseMemo\b/.test(code)) {
    signals.push({ skill: 'frontend', weight: 2, reason: 'React hooks detected in code' });
    signals.push({ skill: 'performance', weight: 2, reason: 'React hooks — render optimisation opportunity' });
  }
  if (/\bJSX\b|<[A-Z][A-Za-z]+[\s/>]/.test(code)) {
    signals.push({ skill: 'frontend', weight: 1, reason: 'JSX/component syntax detected' });
  }

  // Async patterns
  if (/\basync\b.*\bawait\b|\bPromise\b|\b\.then\(|\b\.catch\(/.test(code)) {
    signals.push({ skill: 'performance', weight: 2, reason: 'Async/await or Promise patterns detected' });
  }

  // OOP patterns
  if (/\bclass\s+\w+|\binterface\s+\w+|\babstract\s+class/.test(code)) {
    signals.push({ skill: 'code-quality', weight: 1, reason: 'OOP patterns (class/interface) detected' });
  }

  // API / network calls
  if (/\bfetch\(|\baxios\b|\bhttp\b|\bXMLHttpRequest\b/.test(code)) {
    signals.push({ skill: 'backend', weight: 1, reason: 'HTTP/fetch API calls detected' });
    signals.push({ skill: 'security', weight: 2, reason: 'API calls detected — input validation & auth review needed' });
  }

  // Database patterns
  if (/\bSQL\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bquery\(|\bexecute\(/i.test(code)) {
    signals.push({ skill: 'database', weight: 2, reason: 'SQL/query patterns detected in code' });
    signals.push({ skill: 'security', weight: 2, reason: 'SQL detected — SQL injection risk review' });
    signals.push({ skill: 'performance', weight: 1, reason: 'Database queries benefit from performance review' });
  }

  // Auth patterns
  if (/\bpassword\b|\btoken\b|\bjwt\b|\bauth\b|\bcredential/i.test(code)) {
    signals.push({ skill: 'security', weight: 2, reason: 'Auth/credential patterns detected in code' });
  }

  // Error handling
  if (/\btry\s*\{|\bcatch\s*\(|\bthrow\s+/.test(code)) {
    signals.push({ skill: 'code-quality', weight: 1, reason: 'Error handling patterns detected' });
  }

  return signals;
}

/**
 * Aggregates signals into per-skill scores.
 * Returns sorted array with confidence levels.
 */
function computeSkillScores(signals: DetectionSignal[]): SkillScore[] {
  const scoreMap = new Map<string, { score: number; reasons: string[] }>();

  for (const signal of signals) {
    const existing = scoreMap.get(signal.skill) ?? { score: 0, reasons: [] };
    existing.score += signal.weight;
    if (!existing.reasons.includes(signal.reason)) {
      existing.reasons.push(signal.reason);
    }
    scoreMap.set(signal.skill, existing);
  }

  const result: SkillScore[] = [];
  for (const [skillName, { score, reasons }] of scoreMap.entries()) {
    result.push({
      skillName,
      score,
      reasons,
      confidence: score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low',
    });
  }

  return result.sort((a, b) => b.score - a.score);
}

/** Returns recommended skill names with confidence, falling back to generics. */
function getRecommendedSkills(code: string): SkillScore[] {
  const projectSignals = detectProjectContext();
  const codeSignals = detectCodeContext(code);
  const allSignals = [...projectSignals, ...codeSignals];
  const scores = computeSkillScores(allSignals);

  if (scores.length === 0) {
    // Generic fallback
    return [
      { skillName: 'code-quality', score: 1, reasons: ['No specific signals — generic review'], confidence: 'low' },
      { skillName: 'performance', score: 1, reasons: ['No specific signals — generic review'], confidence: 'low' },
    ];
  }

  return scores;
}

// ─── Adaptive Learning System ────────────────────────────────────────────────

interface LearningData {
  skillUsage: Record<string, number>;
  skillCombinations: Record<string, number>;
}

const LEARNING_KEY = 'copilotToolkit.learningData';

function isLearningEnabled(): boolean {
  return vscode.workspace.getConfiguration('copilotToolkit').get<boolean>('enableLearning', true);
}

function loadLearningData(state: vscode.Memento): LearningData {
  return state.get<LearningData>(LEARNING_KEY, { skillUsage: {}, skillCombinations: {} });
}

async function saveLearningData(state: vscode.Memento, data: LearningData): Promise<void> {
  await state.update(LEARNING_KEY, data);
}

function updateSkillUsage(data: LearningData, selectedSkills: string[]): void {
  for (const skill of selectedSkills) {
    data.skillUsage[skill] = (data.skillUsage[skill] ?? 0) + 1;
  }
}

function updateSkillCombinations(data: LearningData, selectedSkills: string[]): void {
  if (selectedSkills.length < 2) { return; }
  const key = [...selectedSkills].sort().join('+');
  data.skillCombinations[key] = (data.skillCombinations[key] ?? 0) + 1;
}

/**
 * Records which skills were used and persists to globalState.
 * Call this after the user confirms their skill selection.
 */
async function trackSkillUsage(state: vscode.Memento, selectedSkills: string[]): Promise<void> {
  if (!isLearningEnabled() || selectedSkills.length === 0) { return; }
  const data = loadLearningData(state);
  updateSkillUsage(data, selectedSkills);
  updateSkillCombinations(data, selectedSkills);
  await saveLearningData(state, data);
}

/**
 * Computes adaptive score boosts from learning data.
 * Returns a map of skillName → boost score.
 */
function computeAdaptiveScores(data: LearningData, candidateSkills: string[]): Map<string, number> {
  const boosts = new Map<string, number>();
  const totalUsage = Object.values(data.skillUsage).reduce((a, b) => a + b, 0) || 1;

  for (const skill of candidateSkills) {
    const usageCount = data.skillUsage[skill] ?? 0;
    const usageBoost = Math.min(3, Math.round((usageCount / totalUsage) * 10)); // normalised 0-3

    // combo boost — check if this skill appears in frequently used combos
    let comboBoost = 0;
    for (const [combo, count] of Object.entries(data.skillCombinations)) {
      if (combo.split('+').includes(skill)) {
        comboBoost = Math.max(comboBoost, Math.min(2, Math.round(count / 2)));
      }
    }

    boosts.set(skill, usageBoost + comboBoost);
  }

  return boosts;
}

/**
 * Merges context-based scores with adaptive learning boosts.
 * Returns enhanced SkillScore[] sorted by final score.
 */
function mergeWithAdaptiveScores(contextScores: SkillScore[], data: LearningData): SkillScore[] {
  const candidateSkills = contextScores.map(s => s.skillName);

  // Also surface frequently used skills not yet in context scores
  for (const skill of Object.keys(data.skillUsage)) {
    if (!candidateSkills.includes(skill) && (data.skillUsage[skill] ?? 0) >= 2) {
      contextScores.push({
        skillName: skill,
        score: 0,
        reasons: [`Frequently used (${data.skillUsage[skill]} times)`],
        confidence: 'low',
      });
      candidateSkills.push(skill);
    }
  }

  const boosts = computeAdaptiveScores(data, candidateSkills);

  const enhanced = contextScores.map(s => {
    const boost = boosts.get(s.skillName) ?? 0;
    const finalScore = s.score + boost;
    const reasons = [...s.reasons];
    if (boost > 0) {
      const usage = data.skillUsage[s.skillName] ?? 0;
      if (usage > 0) { reasons.push(`Frequently used (${usage}×)`); }
    }
    return {
      ...s,
      score: finalScore,
      reasons,
      confidence: finalScore >= 5 ? 'high' as const : finalScore >= 2 ? 'medium' as const : 'low' as const,
    };
  });

  return enhanced.sort((a, b) => b.score - a.score);
}

/** Returns the most frequently used skill combination as a display hint. */
function getTopComboHint(data: LearningData): string | undefined {
  const entries = Object.entries(data.skillCombinations);
  if (entries.length === 0) { return undefined; }
  const top = entries.sort((a, b) => b[1] - a[1])[0];
  return `You frequently use: ${top[0].replace(/\+/g, ' + ')} (${top[1]}×)`;
}

function loadDefaultSkill(): string {
  const skillPath = getConfigPath('skillFile');
  if (!skillPath || !fs.existsSync(skillPath)) { return DEFAULT_SKILL; }
  try {
    const content = fs.readFileSync(skillPath, 'utf8').trim();
    return content.length > 0 ? content : DEFAULT_SKILL;
  } catch {
    return DEFAULT_SKILL;
  }
}

/** Loads all .md skill files from .copilot/skills/ and prepends the default. */
function loadSkills(): SkillItem[] {
  const items: SkillItem[] = [];

  items.push({
    label: '🧠 Default: copilot-instructions',
    description: '.github/copilot-instructions.md (or built-in fallback)',
    content: loadDefaultSkill(),
    source: 'default',
    skillName: 'default',
  });

  const skillsFolder = getConfigPath('skillsFolder');
  if (!skillsFolder || !fs.existsSync(skillsFolder)) { return items; }

  try {
    const files = fs.readdirSync(skillsFolder).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(skillsFolder, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content) { continue; }
        const name = path.basename(file, '.md');
        items.push({
          label: `🎯 Skill: ${name}`,
          description: `From: ${path.relative(getWorkspaceRoot() ?? '', filePath)}`,
          content,
          source: 'file',
          skillName: name.toLowerCase(),
        });
      } catch { /* skip unreadable */ }
    }
  } catch { /* skip unreadable folder */ }

  return items;
}

/**
 * Matches skill scores against available skill files.
 * Returns skill names that should be pre-selected.
 */
function autoSelectSkills(available: SkillItem[], scores: SkillScore[]): Set<string> {
  const recommended = new Set(scores.map(s => s.skillName));
  const autoSelected = new Set<string>();
  for (const item of available) {
    if (recommended.has(item.skillName)) {
      autoSelected.add(item.skillName);
    }
  }
  return autoSelected;
}

// ─── Smart recommendation UI ──────────────────────────────────────────────────

/**
 * Shows the smart recommendation QuickPick before the full skill picker.
 * Returns 'recommended' | 'customize' | 'cancel'.
 */
async function showRecommendationUI(scores: SkillScore[], comboHint?: string): Promise<'recommended' | 'customize' | 'cancel'> {
  const confidenceIcon = (c: SkillScore['confidence']) =>
    c === 'high' ? '⭐⭐ High' : c === 'medium' ? '⭐ Medium' : '○ Low';

  type RecommendItem = vscode.QuickPickItem & { action: 'recommended' | 'customize' };

  const topScores = scores.slice(0, 5);
  const recommendedList = topScores
    .map(s => `${s.skillName} (${confidenceIcon(s.confidence)})`)
    .join(' · ');
  const items: RecommendItem[] = [
    {
      label: '✅ Use Recommended Skills',
      description: recommendedList,
      detail: [
        ...topScores.map(s => `  • ${s.skillName}: ${s.reasons[0]}`),
        ...(comboHint ? [`  💡 ${comboHint}`] : []),
      ].join('\n'),
      action: 'recommended',
    },
    {
      label: '⚙️ Customize Manually',
      description: 'Open full skill picker to select from all available skills',
      action: 'customize',
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Copilot Toolkit — Smart Skill Recommendation',
    placeHolder: 'Skills were automatically detected from your project and code...',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked) { return 'cancel'; }
  return picked.action;
}

/** Merges multiple skill contents into a single labelled string. */
function mergeSkills(skills: SkillItem[]): string {
  if (skills.length === 0) { return DEFAULT_SKILL; }
  if (skills.length === 1) { return skills[0].content; }
  return skills
    .map((s, i) => `================ SKILL ${i + 1}: ${s.label.replace(/^[🧠🎯]\s[\w-]+:\s/, '')} ================\n${s.content}`)
    .join('\n\n');
}

// ─── Skill preview ────────────────────────────────────────────────────────────

/** Opens a read-only virtual editor tab showing the combined skill content. */
async function previewSkills(skills: SkillItem[]): Promise<void> {
  const combined = mergeSkills(skills);
  const header = `# Copilot Toolkit — Skill Preview\n# Skills selected: ${skills.map(s => s.skillName).join(', ')}\n\n`;
  const fullContent = header + combined;

  const doc = await vscode.workspace.openTextDocument({
    content: fullContent,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
}

// ─── Skill picker UI ──────────────────────────────────────────────────────────

/**
 * Full skill selection flow:
 * 1. Shows QuickPick with auto-detected skills pre-selected
 * 2. Offers a confirm / preview step
 * 3. Returns merged skill string (never undefined — falls back to default)
 */
async function showSkillPicker(code: string, state: vscode.Memento): Promise<string> {
  const available = loadSkills();
  const contextScores = getRecommendedSkills(code);

  // Merge with adaptive learning scores
  const learningData = loadLearningData(state);
  const scores = isLearningEnabled()
    ? mergeWithAdaptiveScores(contextScores, learningData)
    : contextScores;

  const autoSelected = autoSelectSkills(available, scores);

  // ── Step 1: Smart recommendation UI ──────────────────────────────────────
  const hasAvailableSkills = available.length > 1;
  let useCustomPicker = false;

  if (scores.length > 0 && hasAvailableSkills) {
    const comboHint = isLearningEnabled() ? getTopComboHint(learningData) : undefined;
    const choice = await showRecommendationUI(scores, comboHint);
    if (choice === 'cancel') { return loadDefaultSkill(); }
    if (choice === 'customize') { useCustomPicker = true; }
  } else {
    useCustomPicker = true;
  }

  if (!useCustomPicker && autoSelected.size > 0) {
    const selected = available.filter(s => autoSelected.has(s.skillName));
    if (selected.length > 0) {
      await trackSkillUsage(state, selected.map(s => s.skillName));
      return mergeSkills(selected);
    }
  }

  // ── Step 2: Full manual picker ────────────────────────────────────────────
  const preSelected = available.filter(i => autoSelected.has(i.skillName));
  const itemsWithHints: SkillItem[] = available.map(item => {
    const score = scores.find(s => s.skillName === item.skillName);
    const usageCount = learningData.skillUsage[item.skillName] ?? 0;
    let badge = '';
    if (autoSelected.has(item.skillName)) { badge += ' ✅ recommended'; }
    if (isLearningEnabled() && usageCount > 0) { badge += ` · used ${usageCount}×`; }
    return {
      ...item,
      description: badge ? `${item.description ?? ''}${badge}`.trim() : item.description,
      detail: score ? `  Signals: ${score.reasons.slice(0, 2).join(' · ')}` : undefined,
    };
  });

  const qp = vscode.window.createQuickPick<SkillItem>();
  qp.title = `Copilot Toolkit — Select Skills (${preSelected.length} recommended)`;
  qp.placeholder = 'Pick one or more skill instruction sets (Escape = use default)...';
  qp.canSelectMany = true;
  qp.matchOnDescription = true;
  qp.items = itemsWithHints;
  qp.selectedItems = preSelected;

  const selected: SkillItem[] = await new Promise(resolve => {
    qp.onDidAccept(() => { resolve([...qp.selectedItems]); qp.dispose(); });
    qp.onDidHide(() => { resolve([]); qp.dispose(); });
    qp.show();
  });

  if (selected.length === 0) {
    vscode.window.showInformationMessage('Copilot Toolkit: No skill selected — using default instructions.');
    return loadDefaultSkill();
  }

  // ── Step 3: Confirm / Preview ─────────────────────────────────────────────
  type ConfirmItem = vscode.QuickPickItem & { action: 'confirm' | 'preview' };
  const confirmItems: ConfirmItem[] = [
    {
      label: '✅ Confirm & Continue',
      description: `${selected.length} skill(s): ${selected.map(s => s.skillName).join(', ')}`,
      action: 'confirm',
    },
    {
      label: '👁 Preview Selected Skills',
      description: 'Open a read-only editor tab showing the combined skill content',
      action: 'preview',
    },
  ];

  while (true) {
    const confirmPick = await vscode.window.showQuickPick(confirmItems, {
      title: 'Copilot Toolkit — Skill Review',
      placeHolder: 'Review your selected skills before continuing...',
    });
    if (!confirmPick) { return loadDefaultSkill(); }
    if (confirmPick.action === 'preview') { await previewSkills(selected); continue; }
    break;
  }

  await trackSkillUsage(state, selected.map(s => s.skillName));
  return mergeSkills(selected);
}

async function pickSkills(code: string, state: vscode.Memento): Promise<string> {
  return showSkillPicker(code, state);
}

/**
 * Loads user prompts from the configured prompt folder and merges with built-ins.
 * Built-ins always appear first; user prompts follow.
 */
function loadAllPrompts(): PromptItem[] {
  const userPrompts: PromptItem[] = [];
  const promptFolder = getConfigPath('promptFolder');

  if (promptFolder && fs.existsSync(promptFolder)) {
    try {
      const files = fs.readdirSync(promptFolder).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(promptFolder, file);
        try {
          const body = fs.readFileSync(filePath, 'utf8').trim();
          const name = path.basename(file, '.md');
          userPrompts.push({
            label: `📂 User: ${name}`,
            description: `From: ${path.relative(getWorkspaceRoot() ?? '', filePath)}`,
            body,
            source: 'file',
          });
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // skip unreadable folder
    }
  }

  return [...getBuiltInPrompts(), ...userPrompts];
}

// ─── Active code reader ───────────────────────────────────────────────────────

interface ActiveCode {
  code: string;
  fileName: string;
  languageId: string;
}

function getActiveCode(): ActiveCode | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return undefined; }

  const selection = editor.selection;
  const code = selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(selection);

  const fileName = editor.document.fileName.split(/[\\/]/).pop() ?? 'unknown';
  const languageId = editor.document.languageId;
  return { code, fileName, languageId };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildFinalPrompt(skill: string, promptBody: string, code: string, fileName: string, languageId: string): string {
  const hasMultiSkill = skill.includes('================ SKILL');
  const header = hasMultiSkill
    ? 'You must follow ALL instruction sets below and combine their insights. Treat each as a separate expert perspective. Resolve conflicts by prioritizing correctness and safety.\n\nOutput format:\n🚫 Blockers\n⚠️ Warnings\n💡 Suggestions\n🧠 Skill Insights (note which skill identified each issue)'
    : 'You must follow all instruction sets below and combine their insights.';

  return [
    header,
    `=== INSTRUCTIONS ===\n${skill}`,
    `=== TASK ===\n${promptBody}`,
    `=== CODE (${fileName} · Language: ${languageId}) ===\n\`\`\`${languageId}\n${code}\n\`\`\``,
  ].join('\n\n');
}

function buildWorkflowPrompt(skill: string, selectedPrompts: PromptItem[], code: string, fileName: string, languageId: string): string {
  const hasMultiSkill = skill.includes('================ SKILL');
  const header = hasMultiSkill
    ? 'You must follow ALL instruction sets below and execute each task step sequentially, combining insights from all skills per step.\n\nOutput format per step:\n🚫 Blockers\n⚠️ Warnings\n💡 Suggestions\n🧠 Skill Insights'
    : 'You must follow all instruction sets below and execute each task step sequentially, providing a structured answer for each:';

  const steps = selectedPrompts
    .map((p, i) => `--- Step ${i + 1}: ${p.label.replace(/^[⚡📂]\s[\w-]+:\s/, '')} ---\n${p.body}`)
    .join('\n\n');

  return [
    header,
    `=== INSTRUCTIONS ===\n${skill}`,
    `=== TASKS ===\n${steps}`,
    `=== CODE (${fileName} · Language: ${languageId}) ===\n\`\`\`${languageId}\n${code}\n\`\`\``,
  ].join('\n\n');
}

// ─── Send to Copilot ──────────────────────────────────────────────────────────

async function sendToCopilot(prompt: string): Promise<void> {
  try {
    await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt });
  } catch {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Copilot Toolkit: Could not open Copilot Chat automatically. The prompt has been copied to your clipboard.',
    );
  }
}

// ─── Workflow handler ─────────────────────────────────────────────────────────

async function runWorkflowMode(active: ActiveCode, state: vscode.Memento): Promise<void> {
  // Step 1 — pick skills (with smart recommendations from active code)
  const skill = await pickSkills(active.code, state);

  // Step 2 — pick prompts
  const allPrompts = loadAllPrompts();
  if (allPrompts.length === 0) {
    vscode.window.showWarningMessage('Copilot Toolkit: No prompts available for workflow.');
    return;
  }

  const selected = await vscode.window.showQuickPick(allPrompts, {
    title: 'Copilot Toolkit — Step 2 of 2: Select Prompts',
    placeHolder: 'Select one or more prompts to run sequentially...',
    canPickMany: true,
    matchOnDescription: true,
  });
  if (!selected || selected.length === 0) {
    vscode.window.showWarningMessage('Copilot Toolkit: No prompts selected for workflow.');
    return;
  }

  // Step 3 — build and send
  const finalPrompt = buildWorkflowPrompt(skill, selected, active.code, active.fileName, active.languageId);
  await sendToCopilot(finalPrompt);
}

// ─── Mode selector ────────────────────────────────────────────────────────────

interface ModeItem extends vscode.QuickPickItem {
  mode: 'single' | 'workflow';
}

async function selectMode(): Promise<ModeItem | undefined> {
  const modes: ModeItem[] = [
    {
      label: '$(zap) Run Single Prompt',
      description: 'Pick one prompt and run it against the active file',
      mode: 'single',
    },
    {
      label: '$(sync) Run Multi-Step Workflow',
      description: 'Select multiple prompts and run them together as sequential steps',
      mode: 'workflow',
    },
  ];

  return vscode.window.showQuickPick(modes, {
    title: 'Copilot Toolkit',
    placeHolder: 'Choose a mode...',
  });
}

// ─── Extension entry points ───────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  const state = context.globalState;

  // ── Reset learning command ──────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-toolkit.resetLearning', async () => {
      await state.update(LEARNING_KEY, undefined);
      vscode.window.showInformationMessage('Copilot Toolkit: Learned skill preferences have been reset.');
    })
  );

  const disposable = vscode.commands.registerCommand('copilot-toolkit.open', async () => {

    // 1. Get active code
    const active = getActiveCode();
    if (!active) {
      vscode.window.showWarningMessage('Copilot Toolkit: No active editor found. Please open a file first.');
      return;
    }
    if (active.code.trim().length === 0) {
      vscode.window.showWarningMessage('Copilot Toolkit: The file or selection is empty.');
      return;
    }

    // 2. Select mode
    const mode = await selectMode();
    if (!mode) { return; }

    // 3. Branch on mode
    if (mode.mode === 'workflow') {
      await runWorkflowMode(active, state);
      return;
    }

    // 4. Single prompt mode — Step 1: skills, Step 2: prompt
    const skill = await pickSkills(active.code, state);

    const prompts = loadAllPrompts();
    if (prompts.length === 0) {
      vscode.window.showWarningMessage('Copilot Toolkit: No prompts found. Add .md files to your prompt folder or check your settings.');
      return;
    }

    const picked = await vscode.window.showQuickPick(prompts, {
      title: 'Copilot Toolkit — Step 2 of 2: Select Prompt',
      placeHolder: 'Select a prompt...',
      matchOnDescription: true,
    });
    if (!picked) { return; }

    const finalPrompt = buildFinalPrompt(skill, picked.body, active.code, active.fileName, active.languageId);
    await sendToCopilot(finalPrompt);
  });

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
