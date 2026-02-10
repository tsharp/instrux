# Instrux Syntax Reference

A simpler, more intuitive alternative to Handlebars for composing AI agent instructions.

## Design Principles

- **Clean & Readable**: Using `@` directives instead of `{{curly braces}}`
- **Intuitive**: Natural language-like commands
- **Minimal Nesting**: Avoid deep hierarchies
- **Markdown-First**: Works seamlessly with markdown content

---

## Comments

Single-line comments start with `@!` and are stripped from output:

```
@! This is a comment
@! Use multiple lines for longer comments
```

---

## Frontmatter

Files can include YAML frontmatter for metadata:

```markdown
---
# Agent system metadata
role: assistant
model: claude-3.5-sonnet

# Instrux compilation metadata (ix: prefix)
ix:title: Security Guidelines
ix:tags: [security, compliance]
ix:priority: 10
ix:enabled: true
---

# Content starts here
```

### Instrux vs Agent Metadata

Instrux-specific fields are namespaced under `ix:` and stripped from final output:

```markdown
---
# Agent system metadata (preserved in output)
role: assistant
model: claude-3.5-sonnet

# Instrux compilation metadata (stripped from output)
ix:tags: [security, compliance]
ix:priority: 10
ix:enabled: true
---
```

Use `ix:` prefix for compilation-only fields (filtering, sorting). Unprefixed fields pass through to the final agent instructions.

### Output Control

Configure in `agent.json`:
```json
{
  "frontmatter": {
    "output": "preserve"  // Default: Keep non-ix: fields in output
    // or "strip"         // Remove all frontmatter from output
  }
}
```

**Example with `output: "preserve"`:**

Input file:
```markdown
---
role: assistant
temperature: 0.7
ix:tags: [security]
ix:priority: 10
---
Content here...
```

Output to agent system:
```markdown
---
role: assistant
temperature: 0.7
---
Content here...
```

The `ix:*` fields are stripped; only agent metadata remains.

---

## File Import

### By Path

```
@import common/guidelines
@import /base/system-prompt
```

Paths are relative to current file unless they start with `/` (agent root). Extension `.md` is optional.

### By Tag

```
@import where:tag=security
@import where:tag=security,privacy sort:priority
```

Import all files with matching `ix:tags` frontmatter. Multiple tags are OR'd. Add `sort:field` to order results.

---

## Iteration

Loop over files matching a glob pattern:

```
@each-file:tools/*.md
  ## {filename}
  {content}
@end
```

### Available Variables

- `{filename}` - Name without extension
- `{path}` - Relative path
- `{content}` - File content
- `{ix.title}`, `{ix.priority}` - Instrux frontmatter fields
- `{role}`, `{model}` - Non-prefixed frontmatter (passes to output)

### Filtering & Sorting

```
@each-file:plugins/*.md where:ix.enabled=true sort:ix.priority
  {content}
@end
```

---

## Conditionals

```
@if agent.name == "CustomerSupport"
  Customer-specific content here.
@end

@if config.verbose
  Detailed explanation...
@else
  Brief summary...
@end

@if agent.tier == "premium" and config.language == "en"
  Premium English content
@end
```

Supports `==`, `!=`, `>`, `<`, `>=`, `<=`, `and`, `or` operators.

---

## Variables

### Built-in

```
{agent.name}           → Agent name from config
{agent.description}    → Agent description from config
```

### Frontmatter Fields

Access frontmatter from current file:

```
{role}                 → Non-prefixed field (passes to output)
{ix.title}             → Instrux metadata (compilation only)
{ix.priority}          → Instrux metadata (compilation only)
```

### Custom

```
@set model=claude-3.5-sonnet
@set max_tokens=4000

Using {model} with {max_tokens} tokens.
```

---

## Transformations

### Filters

```
{agent.name|uppercase}    → MYAGENT
{agent.name|lowercase}    → myagent
{content|trim}            → Remove whitespace
{content|indent:2}        → Indent by 2 spaces
{content|first:100}       → First 100 chars
```

---

## Advanced

### Reusable Blocks

```
@define safety-rules
  1. Verify user identity
  2. Never share personal data
  3. Escalate sensitive requests
@end

@import #safety-rules
```

### Context in Loops

```
@each-file:scenarios/*.md
  @import templates/wrapper
  @! wrapper.md accesses {filename}, {content}, etc.
@end
```

### Filter Chains

```
@import where:tag=examples | first:3
@import where:tag=tools | sort:priority | reverse
@each-file:docs/*.md where:status=published sort:date
  {content}
@end
```

---

## Comparison with Handlebars

| Feature | Handlebars | Instrux Syntax |
|---------|------------|----------------|
| File include | `{{> partial}}` | `@import partial` |
| Tag include | `{{#tagged "tag"}}...{{/tagged}}` | `@import where:tag=security` |
| Iteration | `{{#each items}}...{{/each}}` | `@each-file:*.md ... @end` |
| Conditional | `{{#if condition}}...{{/if}}` | `@if condition ... @end` |
| Variable | `{{agent.name}}` | `{agent.name}` |
| Comment | `{{! comment }}` | `@! comment` |

---

## Examples

### Simple

```markdown
@import base/system-prompt
@import base/capabilities

## Specialization
This agent handles customer support.

@import where:tag=customer-support
@import /common/safety-guidelines
```

### With Frontmatter

Given a file `tools/calculator.md`:
```markdown
---
ix:title: Calculator Tool
ix:priority: 5
ix:category: math
---
Performs calculations...
```

Use in template:
```markdown
@each-file:tools/*.md sort:ix.priority
  ### {ix.title} (Priority: {ix.priority})
  Category: {ix.category}
  {content}
@end
```

### With Loops

```markdown
@import base/core

## Tools
@each-file:tools/*.md sort:ix.priority
  ### {ix.title}
  {ix.description}
  {content}
@end

@if config.include-examples
  @import where:tag=examples | first:5
@end
```

### Conditional

```markdown
@if agent.tier == "enterprise"
  @import features/enterprise
@else
  @import features/standard
@end

@import where:tag=safety
```

---

## Migration from Handlebars

### Before (Handlebars)
```handlebars
{{> base/system-prompt}}

{{#tagged "security"}}
{{#each this}}
### {{frontmatter.title}}
{{content}}
{{/each}}
{{/tagged}}
```

### After (Instrux)
```
@import base/system-prompt

@each-file:* where:tag=security
  ### {ix.title}
  {content}
@end
```

---

## Implementation Notes

- Directives (`@...`) must start at beginning of line (no leading whitespace)
- Relative paths are from current file directory
- Leading `/` means agent root directory
- Cycle detection prevents infinite recursion
- Escape variables with backslash: `\{var\}`
- **Frontmatter isolation**: Use `ix:` prefix for compilation metadata to keep it separate from agent system frontmatter