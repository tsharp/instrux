# instrux

A CLI tool for composing modular AI agent instruction files into complete system prompts — from simple merge to a full **instruction compiler** with frontmatter tagging and Handlebars templates.

## Install

```bash
npm install -g instrux
```

Or use without installing:

```bash
npx instrux <command>
```

## Quick Start

### Simple mode — ordered file merge

```bash
instrux init MyAgent
# Edit agents/MyAgent/specialization.md
instrux build MyAgent
```

### Template mode — frontmatter tags + Handlebars

```bash
instrux init --template MyAgent
# Edit agents/base/*.md        (tagged components)
# Edit agents/MyAgent/template.md  (Handlebars entry point)
instrux build MyAgent
```

## Commands

| Command | Description |
|---|---|
| `instrux init <name>` | Scaffold a simple-merge agent |
| `instrux init -t <name>` | Scaffold a template-compiled agent |
| `instrux build <name>` | Build (merge or compile) an agent |
| `instrux build --all` | Build all agents |
| `instrux list` | List all agents |
| `instrux config <name>` | Show agent configuration |
| `instrux validate <name>` | Check required source files |

---

## Simple Mode (v1)

Files are merged in the order listed in `agent.json`:

```json
{
  "name": "MyAgent",
  "files": [
    { "path": "agents/base/instructions.md", "required": true },
    { "path": "agents/MyAgent/specialization.md", "required": true }
  ],
  "mergeSettings": { "addSeparators": true, "separatorStyle": "---" }
}
```

---

## Template Mode (v2) — The Instruction Compiler

Template mode turns instrux into a build system for agent instructions:

1. **Source files** declare themselves via YAML frontmatter tags
2. An **entry template** uses Handlebars to compose them
3. The compiler **recursively resolves** all references
4. Output is a single, merged document

### Frontmatter

Every source file has YAML frontmatter. Standard fields (title, author, etc.) are yours to keep. The `instrux:` block drives compilation:

```yaml
---
title: Safety Guidelines          # ← standard frontmatter (preserved if configured)
author: Platform Team

instrux:                           # ← compiler metadata (always stripped from output)
  tags: [safety, compliance]       #    tags for referencing this file
  order: 2                         #    sort order within a tag group
  description: Core safety rules   #    description for iteration
---

# Safety Guidelines

- Always provide accurate information
- Decline harmful requests
```

### Handlebars Helpers

Use these in your entry template (or any source file — they resolve recursively):

#### `{{{tag "tagname"}}}`

Includes **all files** matching the tag, sorted by `instrux.order`, separated by the configured separator. Each file is itself compiled (recursive).

```markdown
# System Prompt

{{{tag "identity"}}}

---

{{{tag "safety"}}}

---

{{{tag "domain"}}}
```

#### `{{{file "path/to/file.md"}}}`

Includes a **specific file** by path. Also recursively compiled.

```markdown
{{{file "agents/base/disclaimers.md"}}}
```

#### `{{#each (tagged "tagname")}} ... {{/each}}`

Iterates over tagged files for custom rendering. Each item exposes:

| Property | Description |
|---|---|
| `this.body` | Recursively compiled content |
| `this.raw` | Uncompiled source content |
| `this.title` | Frontmatter title |
| `this.description` | Frontmatter or instrux description |
| `this.path` | Relative file path |
| `this.frontmatter` | Full frontmatter object |
| `this.instrux` | instrux metadata block |

```markdown
## Knowledge Base

{{#each (tagged "knowledge")}}
### {{this.title}}

{{{this.body}}}

---

{{/each}}
```

#### `{{meta "key"}}`

Access the current file's frontmatter value:

```markdown
<!-- This document: {{meta "title"}} -->
```

### Agent Config (Template Mode)

```json
{
  "name": "MyAgent",
  "description": "Compiled instructions for MyAgent",
  "outputDirectory": "out",
  "outputFilePattern": "myagent_instructions.md",
  "entry": "agents/MyAgent/template.md",
  "sources": [
    "agents/base/**/*.md",
    "agents/MyAgent/**/*.md"
  ],
  "frontmatter": {
    "output": "strip"
  },
  "mergeSettings": {
    "addSeparators": true,
    "separatorStyle": "---"
  }
}
```

| Field | Description |
|---|---|
| `entry` | The Handlebars template that drives compilation |
| `sources` | Glob patterns for files to scan and index by tag |
| `frontmatter.output` | `"strip"` (default) or `"preserve"` entry file's non-instrux frontmatter |

### Project Layout (Template Mode)

```
agents/
  base/
    identity.md           ← instrux.tags: [identity]
    safety.md             ← instrux.tags: [safety]
    api_reference.md      ← instrux.tags: [knowledge, api]
  MyAgent/
    agent.json            ← config with entry + sources
    template.md           ← Handlebars entry template
    domain.md             ← instrux.tags: [domain]
    protocols.md          ← instrux.tags: [domain], order: 2
out/
  myagent_instructions.md ← compiled output
```

### Recursive Compilation

Templates can include files that themselves contain Handlebars expressions. The compiler resolves everything recursively with **cycle detection** — if file A includes file B which includes file A, you get a clear error:

```
Circular reference detected:
  agents/MyAgent/template.md → agents/base/intro.md → agents/MyAgent/template.md
```

---

## Merge Settings

| Setting | Default | Description |
|---|---|---|
| `addSeparators` | `true` | Insert separator between sections |
| `separatorStyle` | `"---"` | Separator string |
| `includeFileHeaders` | `false` | Add HTML comments with source file info |
| `preserveFormatting` | `true` | Keep original whitespace |
| `generateHash` | `false` | Append content hash to filename |
| `useTimestamp` | `false` | Append timestamp to filename |

## Multiple Agents

You can mix simple and template agents in the same project:

```
agents/
  base/
    identity.md
    safety.md
  CustomerSupport/         ← template mode
    agent.json
    template.md
    product_knowledge.md
  QuickBot/                ← simple mode
    agent.json
    specialization.md
```

```bash
instrux build --all        # builds every agent
```

## Programmatic API

```typescript
import { InstruxEngine, InstruxCompiler, initTemplateAgent } from 'instrux';

// Scaffold a template agent
await initTemplateAgent(process.cwd(), 'MyAgent');

// Build (auto-detects simple vs template mode)
const engine = new InstruxEngine();
const result = await engine.build('MyAgent');
console.log(result.outputPath);

// Or use the compiler directly
import { buildSourceIndex } from 'instrux';
const config = await engine.loadConfig('MyAgent');
const compiler = new InstruxCompiler(process.cwd(), config);
const { output, filesCompiled, tagsUsed } = await compiler.compile();
```

## License

This project is dual-licensed under your choice of:

- [MIT License](LICENSE-MIT)
- [Apache License 2.0](LICENSE-APACHE)

You may use this project under the terms of either license.
