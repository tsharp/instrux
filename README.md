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
# Output:
# ✅ MyAgent built successfully
#    Output: out/myagent_instructions.md
#    Size:   1,234 chars
#    Tokens: ~925 (estimated)
#    Hash:   a1b2c3d4
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
| `instrux config:init` | Create repository-level config file |
| `instrux build <name>` | Build (merge or compile) an agent |
| `instrux build --all` | Build all agents |
| `instrux list` | List all agents |
| `instrux config <name>` | Show agent configuration |
| `instrux validate <name>` | Check required source files |

---

## Repository Configuration

A repository-level config file (`instrux.json`) at your project root sets default settings for all agents.

**Auto-creation:** When you run `instrux init` for the first time, the repository config is created automatically with sensible defaults.

You can also create it manually:

```bash
instrux config:init
```

This creates an `instrux.json` file with default settings:

```json
{
  "agentsDirectory": "agents",
  "outputDirectory": "out",
  "tokenizerModel": "gpt-4",
  "mergeSettings": {
    "addSeparators": true,
    "separatorStyle": "---",
    "includeFileHeaders": false,
    "preserveFormatting": true,
    "generateHash": false,
    "useTimestamp": false
  },
  "frontmatter": {
    "output": "strip"
  },
  "sources": ["base/**/*.md"]
}
```

**Configuration Options:**

| Field | Default | Description |
|---|---|---|
| `agentsDirectory` | `"agents"` | Directory containing agent folders (e.g., `"src/agents"` for src/agents/MyAgent/) |
| `outputDirectory` | `"out"` | Where to write compiled output files. Can be relative (e.g., `"out"`, `"build/prompts"`) or absolute. Supports sub-paths. |
| `tokenizerModel` | `"gpt-4"` | Model to use for token estimation. Supports any model available in tiktoken (e.g., `"gpt-4"`, `"gpt-3.5-turbo"`, `"claude"`) |
| `mergeSettings` | See above | Default merge behavior for all agents |
| `frontmatter` | `{ output: "strip" }` | How to handle frontmatter in output |
| `sources` | `["base/**/*.md"]` | Shared source patterns (relative to agentsDirectory) for template mode |

**Benefits:**
- Set defaults once for all agents
- Individual agent configs inherit these settings
- Agent configs can override any setting
- Keep agent configs minimal and focused

**Example workflow:**

```bash
# 1. Create your first agent (auto-creates instrux.json)
instrux init MyAgent

# 2. (Optional) Edit instrux.json to customize defaults

# 3. Create more agents - they inherit repo defaults
instrux init AnotherAgent

# 4. Agent configs only need to specify what's unique
```

**Using a custom agents directory:**

To organize agents in a different location (e.g., `src/agents`):

```bash
# 1. Create instrux.json first
instrux config:init

# 2. Edit instrux.json and change agentsDirectory
# {
#   "agentsDirectory": "src/agents",
#   ...
# }

# 3. Now create agents - they'll be in src/agents/
instrux init MyAgent
# Creates: src/agents/MyAgent/agent.json
```

**Config inheritance and precedence:**

Settings are merged in this order (later overrides earlier):
1. Built-in defaults (`DEFAULT_MERGE_SETTINGS`)
2. Repository config (`instrux.json`)
3. Agent config (`agents/<name>/agent.json`)

This means:
- If a setting is in the agent config, it's used
- Otherwise, if it's in the repo config, it's used
- Otherwise, the built-in default is used

You can make agent configs minimal by removing fields you want to inherit:

```json
{
  "name": "MyAgent",
  "description": "My agent",
  "files": [...]
  // outputDirectory inherited from instrux.json
  // mergeSettings inherited from instrux.json
}
```

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
  "entry": "template.md",
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
| `entry` | The Handlebars template file **relative to the agent's directory** (e.g., `"template.md"` → `agents/MyAgent/template.md`) |
| `sources` | *(Optional)* Additional glob patterns to scan. **Agent's own directory is always included automatically** (e.g., `agents/MyAgent/**/*.md`). Patterns from `instrux.json` are also included, resolved relative to `agentsDirectory`. |
| `frontmatter.output` | `"strip"` (default) or `"preserve"` entry file's non-instrux frontmatter |

**Path Resolution Rules:**

1. **`entry`** is always relative to the agent's directory:
   - `"entry": "template.md"` → `agents/MyAgent/template.md`
   - No need to specify the full path!

2. **`sources`** work in layers:
   - **Layer 1 (automatic):** The agent's directory is always included: `agents/MyAgent/**/*.md`
   - **Layer 2 (repo config):** Patterns from `instrux.json` are resolved relative to `agentsDirectory`:
     - `"sources": ["base/**/*.md"]` in `instrux.json` → `agents/base/**/*.md`
   - **Layer 3 (agent config):** Agent-specific patterns from `agent.json` are used as-is

3. **Why?** This ensures every agent can use its own markdown files without explicit configuration, while still accessing shared resources from the base directory.

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
console.log(result.outputPath);        // "out/myagent_instructions.md"
console.log(result.contentLength);     // 1234
console.log(result.estimatedTokens);   // 925
console.log(result.contentHash);       // "a1b2c3d4"

// Or use the compiler directly
import { buildSourceIndex } from 'instrux';
const config = await engine.loadConfig('MyAgent');
const compiler = new InstruxCompiler(process.cwd(), config);
const { output, filesCompiled, tagsUsed } = await compiler.compile();
```

## Development

### Running Tests

This project uses Jest for testing:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Building

```bash
# Build TypeScript to JavaScript
npm run build

# Watch mode for development
npm run watch
```

### Project Structure

```
src/
  cli.ts           # CLI entry point
  engine.ts        # Core build engine
  compiler.ts      # Template compiler
  init.ts          # Scaffolding functions
  frontmatter.ts   # Frontmatter parsing
  types.ts         # TypeScript types
  *.test.ts        # Jest test files
```

## License

This project is dual-licensed under your choice of:

- [MIT License](LICENSE-MIT)
- [Apache License 2.0](LICENSE-APACHE)

You may use this project under the terms of either license.
