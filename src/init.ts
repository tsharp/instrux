/**
 * instrux init — scaffold a new agent project or add an agent to an existing one.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { AgentConfig, DEFAULT_MERGE_SETTINGS } from './types';

/**
 * Create the directory structure and starter files for a new agent.
 *
 * Resulting layout (relative to `rootDir`):
 *
 *   agents/
 *     base/
 *       instructions.md        ← shared base instructions
 *     <agentName>/
 *       agent.json             ← agent configuration
 *       specialization.md      ← agent-specific content
 *   out/                       ← default output directory
 */
export async function initAgent(
  rootDir: string,
  agentName: string,
): Promise<string[]> {
  const created: string[] = [];
  const agentDir = path.join(rootDir, 'agents', agentName);
  const baseDir = path.join(rootDir, 'agents', 'base');
  const outDir = path.join(rootDir, 'out');

  // ── agents/base/instructions.md ───────────────────────
  const baseInstructions = path.join(baseDir, 'instructions.md');
  if (!(await fs.pathExists(baseInstructions))) {
    await fs.ensureDir(baseDir);
    await fs.writeFile(
      baseInstructions,
      `# Base Instructions\n\nShared instructions that apply to all agents.\nAdd common behavioral guidelines, tone, and constraints here.\n`,
      'utf-8',
    );
    created.push(path.relative(rootDir, baseInstructions));
  }

  // ── agents/<name>/agent.json ──────────────────────────
  if (await fs.pathExists(agentDir)) {
    throw new Error(`Agent "${agentName}" already exists at ${path.relative(rootDir, agentDir)}`);
  }

  await fs.ensureDir(agentDir);

  const config: AgentConfig = {
    name: agentName,
    description: `Instructions for the ${agentName} agent`,
    outputDirectory: 'out',
    outputFilePattern: `${agentName.toLowerCase()}_instructions.md`,
    files: [
      {
        path: 'agents/base/instructions.md',
        description: 'Shared base instructions',
        required: true,
      },
      {
        path: `agents/${agentName}/specialization.md`,
        description: `${agentName}-specific knowledge and instructions`,
        required: true,
      },
    ],
    mergeSettings: { ...DEFAULT_MERGE_SETTINGS },
  };

  const configPath = path.join(agentDir, 'agent.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  created.push(path.relative(rootDir, configPath));

  // ── agents/<name>/specialization.md ───────────────────
  const specPath = path.join(agentDir, 'specialization.md');
  await fs.writeFile(
    specPath,
    `# ${agentName} — Specialization\n\n` +
    `## Capabilities\n\n` +
    `- Describe this agent's unique capabilities here\n\n` +
    `## Domain Knowledge\n\n` +
    `Add domain-specific reference material, terminology, or protocols.\n`,
    'utf-8',
  );
  created.push(path.relative(rootDir, specPath));

  // ── out/ directory ────────────────────────────────────
  if (!(await fs.pathExists(outDir))) {
    await fs.ensureDir(outDir);
    created.push('out/');
  }

  return created;
}

/**
 * Scaffold a template-based agent with frontmatter tagging and Handlebars.
 *
 * Resulting layout:
 *
 *   agents/
 *     base/
 *       identity.md            ← tagged: [identity]
 *       safety.md              ← tagged: [safety]
 *     <agentName>/
 *       agent.json             ← config with entry + sources
 *       template.md            ← Handlebars entry template
 *       domain.md              ← tagged: [domain]
 *   out/
 */
export async function initTemplateAgent(
  rootDir: string,
  agentName: string,
): Promise<string[]> {
  const created: string[] = [];
  const agentDir = path.join(rootDir, 'agents', agentName);
  const baseDir = path.join(rootDir, 'agents', 'base');
  const outDir = path.join(rootDir, 'out');

  // ── agents/base/identity.md ───────────────────────────
  const identityPath = path.join(baseDir, 'identity.md');
  if (!(await fs.pathExists(identityPath))) {
    await fs.ensureDir(baseDir);
    await fs.writeFile(
      identityPath,
      [
        '---',
        'title: Core Identity',
        'instrux:',
        '  tags: [identity]',
        '  order: 1',
        '---',
        '',
        '# Core Identity',
        '',
        'You are a helpful AI assistant.',
        'Define your core behavioral guidelines here.',
        '',
      ].join('\n'),
      'utf-8',
    );
    created.push(path.relative(rootDir, identityPath));
  }

  // ── agents/base/safety.md ─────────────────────────────
  const safetyPath = path.join(baseDir, 'safety.md');
  if (!(await fs.pathExists(safetyPath))) {
    await fs.writeFile(
      safetyPath,
      [
        '---',
        'title: Safety Guidelines',
        'instrux:',
        '  tags: [safety]',
        '  order: 2',
        '---',
        '',
        '# Safety Guidelines',
        '',
        '- Always provide accurate information',
        '- Decline harmful requests',
        '- Protect user privacy',
        '',
      ].join('\n'),
      'utf-8',
    );
    created.push(path.relative(rootDir, safetyPath));
  }

  // ── agents/<name>/ ────────────────────────────────────
  if (await fs.pathExists(agentDir)) {
    throw new Error(`Agent "${agentName}" already exists at ${path.relative(rootDir, agentDir)}`);
  }
  await fs.ensureDir(agentDir);

  // ── agent.json (template mode) ────────────────────────
  const config: AgentConfig = {
    name: agentName,
    description: `Compiled instructions for the ${agentName} agent`,
    outputDirectory: 'out',
    outputFilePattern: `${agentName.toLowerCase()}_instructions.md`,
    entry: `agents/${agentName}/template.md`,
    sources: [
      'agents/base/**/*.md',
      `agents/${agentName}/**/*.md`,
    ],
    frontmatter: { output: 'strip' },
    mergeSettings: { ...DEFAULT_MERGE_SETTINGS },
  };

  const configPath = path.join(agentDir, 'agent.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  created.push(path.relative(rootDir, configPath));

  // ── template.md (Handlebars entry point) ──────────────
  const templatePath = path.join(agentDir, 'template.md');
  await fs.writeFile(
    templatePath,
    [
      '---',
      `title: ${agentName} System Prompt`,
      'instrux:',
      '  tags: [template]',
      '---',
      '',
      '{{!-- Core sections pulled in by tag --}}',
      '',
      '{{{tag "identity"}}}',
      '',
      '---',
      '',
      '{{{tag "safety"}}}',
      '',
      '---',
      '',
      '{{{tag "domain"}}}',
      '',
      '{{!-- You can also iterate over tagged files:',
      '',
      '{{#each (tagged "knowledge")}}',
      '### {{this.title}}',
      '{{{this.body}}}',
      '{{/each}}',
      '',
      '--}}',
      '',
    ].join('\n'),
    'utf-8',
  );
  created.push(path.relative(rootDir, templatePath));

  // ── domain.md (agent-specific content) ────────────────
  const domainPath = path.join(agentDir, 'domain.md');
  await fs.writeFile(
    domainPath,
    [
      '---',
      `title: ${agentName} Domain Knowledge`,
      'instrux:',
      '  tags: [domain]',
      '  order: 1',
      '---',
      '',
      `# ${agentName} — Domain Knowledge`,
      '',
      '## Capabilities',
      '',
      '- Describe this agent\'s unique capabilities here',
      '',
      '## Reference Material',
      '',
      'Add domain-specific terminology, protocols, or schemas.',
      '',
    ].join('\n'),
    'utf-8',
  );
  created.push(path.relative(rootDir, domainPath));

  // ── out/ directory ────────────────────────────────────
  if (!(await fs.pathExists(outDir))) {
    await fs.ensureDir(outDir);
    created.push('out/');
  }

  return created;
}
