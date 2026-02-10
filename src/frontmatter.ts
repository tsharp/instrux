/**
 * instrux — Frontmatter parsing and source file indexing.
 *
 * Scans source directories, parses YAML frontmatter from each markdown file,
 * and builds a tag-based index for the compiler to resolve references.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';
import { SourceFile, SourceIndex, InstruxMeta } from './types';

/**
 * Scan source file globs, parse frontmatter, and return an indexed collection.
 */
export async function buildSourceIndex(
  rootDir: string,
  sourcePatterns: string[],
): Promise<SourceIndex> {
  // Resolve globs relative to rootDir
  const matched = await fg(sourcePatterns, {
    cwd: rootDir,
    onlyFiles: true,
    dot: false,
    ignore: ['**/node_modules/**'],
  });

  const files: SourceFile[] = [];
  const tags = new Map<string, SourceFile[]>();
  const paths = new Map<string, SourceFile>();

  for (const relPath of matched) {
    const absPath = path.join(rootDir, relPath);
    const raw = await fs.readFile(absPath, 'utf-8');

    const { data: frontmatter, content } = matter(raw);
    const instrux: InstruxMeta = frontmatter.instrux ?? {};

    const sourceFile: SourceFile = {
      path: relPath.replace(/\\/g, '/'), // normalise to forward slashes
      frontmatter,
      instrux,
      content,
    };

    files.push(sourceFile);

    // normalised path → file
    paths.set(sourceFile.path, sourceFile);

    // build tag index
    if (instrux.tags) {
      for (const tag of instrux.tags) {
        const bucket = tags.get(tag) ?? [];
        bucket.push(sourceFile);
        tags.set(tag, bucket);
      }
    }
  }

  return { files, tags, paths };
}

/**
 * Sort source files by instrux.order (ascending), then by path.
 */
export function sortSourceFiles(files: SourceFile[]): SourceFile[] {
  return [...files].sort((a, b) => {
    const oa = a.instrux.order ?? 999;
    const ob = b.instrux.order ?? 999;
    if (oa !== ob) return oa - ob;
    return a.path.localeCompare(b.path);
  });
}

/**
 * Strip the instrux block from frontmatter, returning only standard fields.
 * Used when emitting frontmatter in the final output.
 */
export function stripInstruxMeta(
  frontmatter: Record<string, any>,
): Record<string, any> {
  const { instrux, ...rest } = frontmatter;
  return rest;
}

/**
 * Serialize a frontmatter object back to a YAML block (--- delimited).
 * Returns empty string if the object has no keys.
 */
export function serializeFrontmatter(data: Record<string, any>): string {
  const keys = Object.keys(data);
  if (keys.length === 0) return '';
  return matter.stringify('', data).trimEnd() + '\n\n';
}
