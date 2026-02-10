/**
 * instrux - Core engine
 *
 * Loads agent configs, validates source files, and either:
 *   - Simple merge: concatenates files in order (v1)
 *   - Compile: resolves Handlebars templates + frontmatter tags (v2)
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { encoding_for_model } from 'tiktoken';
import {
  AgentConfig,
  ResolvedAgentConfig,
  RepoConfig,
  BuildResult,
  ValidationResult,
  MergeSettings,
  DEFAULT_MERGE_SETTINGS,
} from './types';
import { InstruxCompiler } from './compiler';

export class InstruxEngine {
  private rootDir: string;
  private repoConfig: RepoConfig | null = null;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  // ── Repo config loading ───────────────────────

  /**
   * Load repository-level configuration from instrux.json at project root.
   * This is cached after the first load.
   */
  async loadRepoConfig(): Promise<RepoConfig | null> {
    if (this.repoConfig !== null) {
      return this.repoConfig;
    }

    const configPath = path.join(this.rootDir, 'instrux.json');
    
    if (!(await fs.pathExists(configPath))) {
      this.repoConfig = {};
      return this.repoConfig;
    }

    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      this.repoConfig = JSON.parse(raw) as RepoConfig;
      return this.repoConfig;
    } catch (err) {
      console.warn(`⚠  Warning: Failed to parse instrux.json: ${err}`);
      this.repoConfig = {};
      return this.repoConfig;
    }
  }

  /**
   * Merge repository config with agent config.
   * Agent config takes precedence over repository config.
   * Returns a config with all required fields populated.
   */
  private mergeConfigs(agentConfig: AgentConfig, repoConfig: RepoConfig): ResolvedAgentConfig {
    const mergeSettings: MergeSettings = {
      ...DEFAULT_MERGE_SETTINGS,
      ...(repoConfig.mergeSettings ?? {}),
      ...(agentConfig.mergeSettings ?? {}),
    };

    const agentsDirectory = repoConfig.agentsDirectory ?? 'agents';
    const agentName = agentConfig.name;
    const agentDir = `${agentsDirectory}/${agentName}`;
    
    // Resolve entry relative to agent directory
    let entry = agentConfig.entry;
    if (entry) {
      // Entry is ALWAYS relative to the agent's directory
      entry = `${agentDir}/${entry}`;
    }
    
    // Build sources array:
    const sources: string[] = [];
    
    // 1. ALWAYS include the agent's own directory and subdirectories
    sources.push(`${agentDir}/**/*.md`);
    
    // 2. Add agent-specific sources from agent.json (if defined)
    if (agentConfig.sources && agentConfig.sources.length > 0) {
      sources.push(...agentConfig.sources);
    }
    
    // 3. Add repo-level sources from instrux.json (relative to agentsDirectory)
    if (repoConfig.sources && repoConfig.sources.length > 0) {
      sources.push(...repoConfig.sources.map(s => `${agentsDirectory}/${s}`));
    } else {
      // Default: include base directory if no repo sources defined
      sources.push(`${agentsDirectory}/base/**/*.md`);
    }

    return {
      ...agentConfig,
      entry,
      agentsDirectory,
      outputDirectory: agentConfig.outputDirectory ?? repoConfig.outputDirectory ?? 'out',
      outputFilePattern: agentConfig.outputFilePattern ?? `${agentName.toLowerCase()}_instructions.md`,
      sources,
      frontmatter: agentConfig.frontmatter ?? repoConfig.frontmatter,
      mergeSettings,
      tokenizerModel: repoConfig.tokenizerModel ?? 'gpt-4',
    };
  }

  // ── Config loading ───────────────────────────────────────

  /**
   * Resolve the config path for a given agent name.
   * Looks in `<agentsDir>/<name>/agent.json`.
   */
  private async agentConfigPath(agentName: string): Promise<string> {
    const repoConfig = await this.loadRepoConfig();
    const agentsDir = repoConfig?.agentsDirectory ?? 'agents';
    return path.join(this.rootDir, agentsDir, agentName, 'agent.json');
  }

  /**
   * Load an agent configuration by name.
   * Merges with repository-level config if present.
   */
  async loadConfig(agentName: string): Promise<ResolvedAgentConfig> {
    const configPath = await this.agentConfigPath(agentName);

    if (!(await fs.pathExists(configPath))) {
      throw new Error(
        `Agent config not found: ${path.relative(this.rootDir, configPath)}\n` +
        `Run "instrux init <name>" to create one.`
      );
    }

    const raw = await fs.readFile(configPath, 'utf-8');
    const agentConfig = JSON.parse(raw) as AgentConfig;
    
    // Load and merge repository config
    const repoConfig = await this.loadRepoConfig();
    return this.mergeConfigs(agentConfig, repoConfig ?? {});
  }

  // ── Discovery ────────────────────────────────────────────

  /**
   * List all agents found in the configured agents directory.
   */
  async listAgents(): Promise<{ name: string; config: AgentConfig | null }[]> {
    const repoConfig = await this.loadRepoConfig();
    const agentsDir = path.join(this.rootDir, repoConfig?.agentsDirectory ?? 'agents');

    if (!(await fs.pathExists(agentsDir))) {
      return [];
    }

    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && e.name !== 'base');

    const agents: { name: string; config: AgentConfig | null }[] = [];

    for (const dir of dirs) {
      const configPath = path.join(agentsDir, dir.name, 'agent.json');
      let config: AgentConfig | null = null;

      if (await fs.pathExists(configPath)) {
        try {
          config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        } catch {
          // invalid JSON — still list the directory
        }
      }

      agents.push({ name: dir.name, config });
    }

    return agents;
  }

  // ── Validation ───────────────────────────────────────────

  async validate(config: ResolvedAgentConfig): Promise<ValidationResult> {
    const missing: string[] = [];
    const warnings: string[] = [];

    const files = config.files ?? [];
    for (const file of files) {
      const fullPath = path.join(this.rootDir, file.path);
      const exists = await fs.pathExists(fullPath);

      if (!exists && file.required) {
        missing.push(file.path);
      } else if (!exists && !file.required) {
        warnings.push(`Optional file not found: ${file.path}`);
      }
    }

    return { valid: missing.length === 0, missing, warnings };
  }

  // ── Merge ────────────────────────────────────────────────

  async merge(config: ResolvedAgentConfig): Promise<string> {
    const { mergeSettings } = config;
    let merged = '';
    let first = true;

    const files = config.files ?? [];

    if (mergeSettings.includeFileHeaders) {
      merged += `<!-- Generated by instrux -->\n`;
      merged += `<!-- Agent: ${config.name} -->\n`;
      merged += `<!-- Generated: ${new Date().toISOString()} -->\n\n`;
    }

    for (const file of files) {
      const fullPath = path.join(this.rootDir, file.path);
      let content = '';

      if (await fs.pathExists(fullPath)) {
        content = await fs.readFile(fullPath, 'utf-8');
      }

      if (!content || content.trim().length === 0) {
        const kind = file.required ? 'required' : 'optional';
        console.log(`  ⚠  Skipping empty ${kind} file: ${file.path}`);
        continue;
      }

      // Trim content from this file
      content = content.trim();

      // separator between sections (not before the first)
      if (!first) {
        if (mergeSettings.addSeparators) {
          merged += `\n${mergeSettings.separatorStyle}\n`;
        } else {
          merged += '\n';
        }
      }

      if (mergeSettings.includeFileHeaders) {
        merged += `<!-- File: ${file.path} -->\n`;
        merged += `<!-- ${file.description} -->\n\n`;
      }

      merged += content;
      first = false;
    }

    // Trim the final output and ensure trailing newline
    merged = merged.trim();
    if (merged.length > 0 && !merged.endsWith('\n')) {
      merged += '\n';
    }
    
    return merged;
  }

  // ── Write output ─────────────────────────────────────────

  async writeOutput(config: ResolvedAgentConfig, content: string): Promise<string> {
    // Resolve output directory relative to rootDir, supporting sub-paths
    const outputDir = path.isAbsolute(config.outputDirectory)
      ? config.outputDirectory
      : path.resolve(this.rootDir, config.outputDirectory);
    
    await fs.ensureDir(outputDir);

    let fileName = config.outputFilePattern;

    if (config.mergeSettings.useTimestamp) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      fileName = fileName.replace('{timestamp}', ts);
    } else {
      fileName = fileName
        .replace('_{timestamp}', '')
        .replace('{timestamp}_', '')
        .replace('{timestamp}', '');
    }

    if (config.mergeSettings.generateHash) {
      const hash = this.contentHash(content);
      fileName = fileName.replace('.md', `_${hash}.md`);
    }

    const outputPath = path.join(outputDir, fileName);
    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
  }

  // ── Build (validate → merge/compile → write) ───────────

  /**
   * Returns true if the agent config uses the template compiler (v2)
   * instead of simple ordered merge.
   */
  isCompileMode(config: ResolvedAgentConfig): boolean {
    return !!config.entry;
  }

  async build(agentName: string): Promise<BuildResult> {
    const config = await this.loadConfig(agentName);

    // ── Template compilation mode ──────────────────────
    if (this.isCompileMode(config)) {
      const compiler = new InstruxCompiler(this.rootDir, config);
      const result = await compiler.compile();

      const outputPath = await this.writeOutput(config, result.output);

      return {
        outputPath: path.relative(this.rootDir, outputPath),
        contentLength: result.output.length,
        contentHash: this.contentHash(result.output),
        estimatedTokens: this.estimateTokens(result.output, config.tokenizerModel),
        filesIncluded: result.filesCompiled,
        filesSkipped: 0,
      };
    }

    // ── Simple merge mode (v1) ─────────────────────────
    if (!config.files || config.files.length === 0) {
      throw new Error(
        'Agent config must define either "entry" (template mode) or "files" (simple merge mode).'
      );
    }

    const validation = await this.validate(config);
    for (const w of validation.warnings) console.log(`  ⚠  ${w}`);
    if (!validation.valid) {
      throw new Error(
        `Missing required files:\n${validation.missing.map(f => `  - ${f}`).join('\n')}`
      );
    }

    const content = await this.merge(config);
    const outputPath = await this.writeOutput(config, content);

    return {
      outputPath: path.relative(this.rootDir, outputPath),
      contentLength: content.length,
      contentHash: this.contentHash(content),
      estimatedTokens: this.estimateTokens(content, config.tokenizerModel),
      filesIncluded: config.files.length,
      filesSkipped: 0,
    };
  }

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Estimate token count for text content using tiktoken.
   * Returns both tiktoken-based and fallback estimates.
   */
  estimateTokens(content: string, model: string = 'gpt-4'): { tiktoken: number; fallback: number } {
    // Calculate fallback estimate
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const totalChars = words.reduce((sum, word) => sum + word.length + 1, 0); // word length + 1 space
    const fallback = Math.ceil(totalChars * 0.75); // ~0.75 tokens per character

    try {
      // Use specified model's tokenizer for accurate token counting
      const encoder = encoding_for_model(model as any);
      const tokens = encoder.encode(content);
      encoder.free(); // Clean up WASM resources
      return { tiktoken: tokens.length, fallback };
    } catch (error) {
      // If tiktoken fails, use fallback for both
      return { tiktoken: -1, fallback };
    }
  }

  contentHash(content: string): string {
    return crypto
      .createHash('md5')
      .update(content)
      .digest('hex')
      .substring(0, 8);
  }
}
