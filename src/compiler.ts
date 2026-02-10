/**
 * instrux — Recursive Handlebars compiler.
 *
 * Compiles an entry template by resolving {{tag}}, {{file}}, and {{tagged}}
 * helpers recursively, producing a single merged output document.
 *
 * Compilation pipeline:
 *   1. Scan sources → parse frontmatter → build tag index
 *   2. Starting from the entry file, compile as Handlebars template
 *   3. Helpers resolve tags/files → each is itself compiled (recursion)
 *   4. Cycle detection via a compile stack
 *   5. Emit final output with optional frontmatter passthrough
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import Handlebars from 'handlebars';
import matter from 'gray-matter';
import {
  AgentConfig,
  SourceIndex,
  SourceFile,
  FrontmatterOutput,
} from './types';
import {
  buildSourceIndex,
  sortSourceFiles,
  stripInstruxMeta,
  serializeFrontmatter,
} from './frontmatter';

export interface CompileResult {
  /** Final compiled output (may include frontmatter block) */
  output: string;
  /** Number of unique files that were compiled */
  filesCompiled: number;
  /** Tags that were referenced during compilation */
  tagsUsed: string[];
}

export class InstruxCompiler {
  private rootDir: string;
  private config: AgentConfig;
  private index!: SourceIndex;
  private compileStack: Set<string> = new Set();
  private compiledFiles: Set<string> = new Set();
  private tagsUsed: Set<string> = new Set();

  constructor(rootDir: string, config: AgentConfig) {
    this.rootDir = rootDir;
    this.config = config;
  }

  // ── Public API ───────────────────────────────────────────

  async compile(): Promise<CompileResult> {
    if (!this.config.entry) {
      throw new Error('No "entry" field in agent config. Use "files" for simple merge mode.');
    }
    if (!this.config.sources || this.config.sources.length === 0) {
      throw new Error('No "sources" patterns defined. Add source globs to agent config.');
    }

    // 1. Build the source index
    console.log('  📑 Scanning sources...');
    this.index = await buildSourceIndex(this.rootDir, this.config.sources);
    console.log(`     Found ${this.index.files.length} source files, ${this.index.tags.size} unique tags`);

    // 2. Compile starting from entry
    console.log('  🔧 Compiling templates...');
    this.compileStack.clear();
    this.compiledFiles.clear();
    this.tagsUsed.clear();

    const entryPath = this.config.entry.replace(/\\/g, '/');
    const body = this.compileFile(entryPath);

    // 3. Handle output frontmatter
    let output = '';
    const fmMode = this.config.frontmatter?.output ?? 'strip';

    if (fmMode === 'preserve') {
      const entrySource = this.index.paths.get(entryPath);
      if (entrySource) {
        const cleanFm = stripInstruxMeta(entrySource.frontmatter);
        output += serializeFrontmatter(cleanFm);
      }
    }

    output += body;

    // Ensure trailing newline
    if (!output.endsWith('\n')) output += '\n';

    return {
      output,
      filesCompiled: this.compiledFiles.size,
      tagsUsed: [...this.tagsUsed],
    };
  }

  // ── Recursive file compilation ───────────────────────────

  private compileFile(relPath: string): string {
    const normalised = relPath.replace(/\\/g, '/');

    // Cycle detection
    if (this.compileStack.has(normalised)) {
      const chain = [...this.compileStack, normalised].join(' → ');
      throw new Error(`Circular reference detected:\n  ${chain}`);
    }
    this.compileStack.add(normalised);
    this.compiledFiles.add(normalised);

    // Resolve content — from index or from disk
    let content: string;
    const indexed = this.index.paths.get(normalised);
    if (indexed) {
      content = indexed.content;
    } else {
      // File not in source index — try reading directly
      const absPath = path.join(this.rootDir, normalised);
      if (!fs.pathExistsSync(absPath)) {
        throw new Error(`File not found: ${normalised}`);
      }
      const raw = fs.readFileSync(absPath, 'utf-8');
      const parsed = matter(raw);
      content = parsed.content;
    }

    // Create a sandboxed Handlebars instance
    const hbs = Handlebars.create();
    this.registerHelpers(hbs);

    // Compile as Handlebars template (noEscape: markdown, not HTML)
    const template = hbs.compile(content, { noEscape: true });
    const rendered = template({
      agent: {
        name: this.config.name,
        description: this.config.description,
      },
      meta: indexed?.frontmatter ?? {},
    });

    this.compileStack.delete(normalised);
    return rendered;
  }

  // ── Handlebars helpers ───────────────────────────────────

  private registerHelpers(hbs: typeof Handlebars): void {
    const self = this;
    const sep = this.config.mergeSettings.addSeparators
      ? `\n${this.config.mergeSettings.separatorStyle}\n\n`
      : '\n\n';

    /**
     * {{tag "tagname"}}
     *
     * Include all files matching the given tag, sorted by instrux.order.
     * Each file is recursively compiled.
     */
    hbs.registerHelper('tag', function (tagName: string) {
      self.tagsUsed.add(tagName);
      const files = self.index.tags.get(tagName);
      if (!files || files.length === 0) {
        console.log(`     ⚠  Tag "${tagName}" matched 0 files`);
        return '';
      }

      const sorted = sortSourceFiles(files);
      const rendered = sorted.map(f => self.compileFile(f.path));
      return new hbs.SafeString(rendered.join(sep));
    });

    /**
     * {{file "path/to/file.md"}}
     *
     * Include a specific file by path. Recursively compiled.
     */
    hbs.registerHelper('file', function (filePath: string) {
      return new hbs.SafeString(self.compileFile(filePath));
    });

    /**
     * {{#each (tagged "tagname")}} ... {{/each}}
     *
     * Returns an array of objects for iteration. Each object has:
     *   - body:        recursively compiled content
     *   - raw:         uncompiled content
     *   - path:        relative file path
     *   - title:       frontmatter title (shortcut)
     *   - description: frontmatter description (shortcut)
     *   - frontmatter: full frontmatter object
     *   - instrux:     instrux metadata
     */
    hbs.registerHelper('tagged', function (tagName: string) {
      self.tagsUsed.add(tagName);
      const files = self.index.tags.get(tagName);
      if (!files || files.length === 0) {
        console.log(`     ⚠  Tag "${tagName}" matched 0 files`);
        return [];
      }

      const sorted = sortSourceFiles(files);
      return sorted.map(f => ({
        body: self.compileFile(f.path),
        raw: f.content,
        path: f.path,
        title: f.frontmatter.title ?? path.basename(f.path, '.md'),
        description: f.frontmatter.description ?? f.instrux.description ?? '',
        frontmatter: f.frontmatter,
        instrux: f.instrux,
      }));
    });

    /**
     * {{meta "key"}}
     *
     * Access a frontmatter value from the current file's context.
     */
    hbs.registerHelper('meta', function (key: string, options: any) {
      return options.data?.root?.meta?.[key] ?? '';
    });
  }
}
