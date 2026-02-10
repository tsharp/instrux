/**
 * instrux - Configuration and type definitions
 */

// ── Repository-level configuration ──────────────────────

/**
 * Repository-level configuration file (instrux.json at project root).
 * Provides defaults for all agents, which can be overridden per-agent.
 */
export interface RepoConfig {
  /** Directory containing agent folders (default: "agents") */
  agentsDirectory?: string;
  /** Default output directory for all agents */
  outputDirectory?: string;
  /** Default merge settings for all agents */
  mergeSettings?: Partial<MergeSettings>;
  /** Default frontmatter settings for template mode */
  frontmatter?: FrontmatterOutput;
  /** Default source patterns for template mode */
  sources?: string[];
  /** Model to use for token estimation (default: "gpt-4") */
  tokenizerModel?: string;
}

// ── Agent-level configuration ───────────────────────────

export interface InstruxFile {
  /** Relative path to the instruction file */
  path: string;
  /** Human-readable description of this file's purpose */
  description: string;
  /** Whether this file must exist for a build to succeed */
  required: boolean;
}

export interface MergeSettings {
  /** Add visual separators between merged files */
  addSeparators: boolean;
  /** Separator string (e.g., "---") */
  separatorStyle: string;
  /** Include HTML comments showing source file info */
  includeFileHeaders: boolean;
  /** Preserve original whitespace and formatting */
  preserveFormatting: boolean;
  /** Append a content hash to the output filename */
  generateHash: boolean;
  /** Append a timestamp to the output filename */
  useTimestamp: boolean;
}

export interface AgentConfig {
  /** Display name of the agent */
  name: string;
  /** Description of the agent's purpose */
  description: string;
  /** Output directory for the merged file (relative to project root) */
  outputDirectory?: string;
  /** Output filename pattern — supports {timestamp} placeholder */
  outputFilePattern?: string;

  // ── Simple merge mode (v1) ──────────────────────────────

  /** Ordered list of instruction files to merge (simple mode) */
  files?: InstruxFile[];

  // ── Template compilation mode (v2) ──────────────────────

  /**
   * Entry template file that drives compilation.
   * When set, instrux uses Handlebars + frontmatter tags instead of simple merge.
   */
  entry?: string;

  /**
   * Glob patterns for source files to scan for frontmatter tags.
   * Example: ["agents/base/*.md", "agents/MyAgent/*md"]   */
  sources?: string[];

  /** Controls how frontmatter is handled in the compiled output */
  frontmatter?: FrontmatterOutput;

  /** Controls how files are merged together */
  mergeSettings?: Partial<MergeSettings>;
}

/**
 * Agent config after merging with repo config and defaults.
 * All required fields are guaranteed to be present.
 */
export interface ResolvedAgentConfig extends AgentConfig {
  agentsDirectory: string;
  outputDirectory: string;
  outputFilePattern: string;
  mergeSettings: MergeSettings;
  tokenizerModel: string;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export interface BuildResult {
  outputPath: string;
  contentLength: number;
  contentHash: string;
  estimatedTokens: {
    tiktoken: number;
    fallback: number;
  };
  filesIncluded: number;
  filesSkipped: number;
}

// ── Frontmatter & compiler types ─────────────────────────

export interface FrontmatterOutput {
  /**
   * How to handle frontmatter in the final output:
   *   - "strip":    Remove all frontmatter (default)
   *   - "preserve": Keep non-instrux frontmatter from the entry file
   */
  output: 'strip' | 'preserve';
}

/** instrux-specific metadata nested under `instrux:` in frontmatter */
export interface InstruxMeta {
  /** Tags used to reference this file from templates */
  tags?: string[];
  /** Sort order when multiple files share a tag (lower = first) */
  order?: number;
  /** Description (used in {{#each (tagged ...)}} iteration) */
  description?: string;
  [key: string]: any;
}

/** A parsed source file with separated frontmatter and content */
export interface SourceFile {
  /** Relative path from project root (forward slashes) */
  path: string;
  /** Full parsed YAML frontmatter */
  frontmatter: Record<string, any>;
  /** instrux-specific metadata extracted from frontmatter.instrux */
  instrux: InstruxMeta;
  /** Markdown body content (without frontmatter) */
  content: string;
}

/** Tag-indexed collection of source files */
export interface SourceIndex {
  /** All scanned source files */
  files: SourceFile[];
  /** tag → SourceFile[] lookup */
  tags: Map<string, SourceFile[]>;
  /** normalised path → SourceFile lookup */
  paths: Map<string, SourceFile>;
}

// ── Defaults ─────────────────────────────────────────────

/** Default merge settings used by `instrux init` */
export const DEFAULT_MERGE_SETTINGS: MergeSettings = {
  addSeparators: true,
  separatorStyle: '---',
  includeFileHeaders: false,
  preserveFormatting: true,
  generateHash: false,
  useTimestamp: false,
};
