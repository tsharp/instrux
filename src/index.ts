/**
 * instrux — public API
 *
 * Exports the engine, compiler, and types for programmatic use.
 */

export { InstruxEngine } from './engine';
export { InstruxCompiler } from './compiler';
export type { CompileResult } from './compiler';
export { initAgent, initTemplateAgent, initRepoConfig } from './init';
export { buildSourceIndex, sortSourceFiles, stripInstruxMeta, serializeFrontmatter } from './frontmatter';
export type {
  AgentConfig,
  ResolvedAgentConfig,
  RepoConfig,
  InstruxFile,
  MergeSettings,
  ValidationResult,
  BuildResult,
  FrontmatterOutput,
  InstruxMeta,
  SourceFile,
  SourceIndex,
} from './types';
export { DEFAULT_MERGE_SETTINGS } from './types';
