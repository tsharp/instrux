#!/usr/bin/env node

/**
 * instrux — CLI for composing modular AI agent instructions.
 *
 * Commands:
 *   instrux init <name>       Scaffold a new agent
 *   instrux config:init       Create repository-level config
 *   instrux build <name>      Merge instruction files for an agent
 *   instrux build --all       Build all agents
 *   instrux list              List available agents
 *   instrux config <name>     Show agent configuration
 *   instrux validate <name>   Validate source files exist
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs-extra';
import { InstruxEngine } from './engine';
import { initAgent, initTemplateAgent, initRepoConfig } from './init';
import { RepoConfig } from './types';

/**
 * Load repo config to get agentsDirectory for help text.
 */
async function getAgentsDir(rootDir: string): Promise<string> {
  const configPath = path.join(rootDir, 'instrux.json');
  if (await fs.pathExists(configPath)) {
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw) as RepoConfig;
      return config.agentsDirectory ?? 'agents';
    } catch {
      return 'agents';
    }
  }
  return 'agents';
}

const pkg = require('../package.json');
const program = new Command();

program
  .name('instrux')
  .description('Compose modular AI agent instruction files into complete system prompts')
  .version(pkg.version);

// ── init ───────────────────────────────────────────────────

program
  .command('init <name>')
  .description('Scaffold a new agent with config and starter files')
  .option('-t, --template', 'Use template mode with frontmatter tags & Handlebars')
  .action(async (name: string, opts: { template?: boolean }) => {
    try {
      const cwd = process.cwd();
      const created = opts.template
        ? await initTemplateAgent(cwd, name)
        : await initAgent(cwd, name);

      const mode = opts.template ? 'template' : 'simple';
      const isFirstAgent = created.includes('instrux.json');
      const agentsDir = await getAgentsDir(cwd);
      
      console.log(`\n\u2705 Agent "${name}" initialized (${mode} mode)!\n`);
      
      if (isFirstAgent) {
        console.log('Created repository config (instrux.json) with default settings.');
        console.log('This provides defaults for all agents in the project.\n');
      }
      
      console.log('Created:');
      created.forEach(f => console.log(`  ${f}`));

      if (opts.template) {
        console.log(`\nNext steps:`);
        console.log(`  1. Edit ${agentsDir}/base/*.md to define shared instructions`);
        console.log(`  2. Edit ${agentsDir}/${name}/domain.md with domain knowledge`);
        console.log(`  3. Edit ${agentsDir}/${name}/template.md to compose via {{tag "..."}}`);
        console.log(`  4. Run: instrux build ${name}\n`);
      } else {
        console.log(`\nNext steps:`);
        console.log(`  1. Edit ${agentsDir}/${name}/specialization.md with your instructions`);
        console.log(`  2. Edit ${agentsDir}/${name}/agent.json to add more files if needed`);
        console.log(`  3. Run: instrux build ${name}\n`);
      }
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

// ── config:init ────────────────────────────────────────────

program
  .command('config:init')
  .description('Create a repository-level config file (instrux.json)')
  .action(async () => {
    try {
      const cwd = process.cwd();
      const created = await initRepoConfig(cwd);

      console.log(`\n✅ Repository config created!\n`);
      console.log(`Created: ${created}\n`);
      console.log('This file provides default settings for all agents.');
      console.log('Individual agent configs will inherit and can override these settings.\n');
      console.log('Default settings:');
      console.log('  - agentsDirectory: "agents"');
      console.log('  - outputDirectory: "out"');
      console.log('  - mergeSettings: standard defaults');
      console.log('  - frontmatter: { output: "strip" }');
      console.log('  - sources: ["agents/base/**/*.md"]\n');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

// ── build ──────────────────────────────────────────────────

program
  .command('build [name]')
  .description('Build (merge) instruction files for an agent')
  .option('--all', 'Build all agents')
  .action(async (name: string | undefined, opts: { all?: boolean }) => {
    const engine = new InstruxEngine();

    try {
      if (opts.all) {
        const agents = await engine.listAgents();
        if (agents.length === 0) {
          console.log('No agents found. Run "instrux init <name>" first.');
          return;
        }
        for (const agent of agents) {
          if (!agent.config) {
            console.log(`⚠  Skipping ${agent.name} (invalid config)`);
            continue;
          }
          console.log(`\n🔨 Building ${agent.name}...`);
          const result = await engine.build(agent.name);
          printBuildResult(agent.name, result);
        }
        return;
      }

      if (!name) {
        console.error('❌ Agent name required. Usage: instrux build <name>');
        console.log('   Run "instrux list" to see available agents.');
        process.exit(1);
      }

      console.log(`\n🔨 Building ${name}...`);
      const result = await engine.build(name);
      printBuildResult(name, result);
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

// ── list ───────────────────────────────────────────────────

program
  .command('list')
  .description('List all available agents')
  .action(async () => {
    const engine = new InstruxEngine();
    const agents = await engine.listAgents();

    if (agents.length === 0) {
      console.log('\nNo agents found.');
      console.log('Run "instrux init <name>" to create one.\n');
      return;
    }

    console.log('\nAvailable agents:\n');
    for (const agent of agents) {
      if (agent.config) {
        try {
          // Load full resolved config to get all values with defaults
          const resolved = await engine.loadConfig(agent.name);
          const mode = resolved.entry ? 'template' : 'simple';
          console.log(`  ${agent.name}  [${mode}]`);
          console.log(`    ${resolved.description}`);
          console.log(`    Files: ${resolved.files?.length ?? resolved.sources?.length ?? 0}  \u2192  ${resolved.outputDirectory}/${resolved.outputFilePattern}`);
        } catch (err) {
          console.log(`  ${agent.name}  (error loading config)`);
        }
      } else {
        console.log(`  ${agent.name}  (invalid or missing agent.json)`);
      }
    }
    console.log();
  });

// ── config ─────────────────────────────────────────────────

program
  .command('config <name>')
  .description('Display the configuration for an agent')
  .action(async (name: string) => {
    const engine = new InstruxEngine();

    try {
      const config = await engine.loadConfig(name);

      console.log(`\n📋 ${config.name}\n`);
      console.log(`  Description:  ${config.description}`);
      console.log(`  Output:       ${config.outputDirectory}/${config.outputFilePattern}`);
      console.log();
      console.log('  Files:');
      (config.files ?? []).forEach((f, i) => {
        const tag = f.required ? 'required' : 'optional';
        console.log(`    ${i + 1}. ${f.path}  [${tag}]`);
        console.log(`       ${f.description}`);
      });
      console.log();
      console.log('  Merge settings:');
      const ms = config.mergeSettings;
      console.log(`    addSeparators: ${ms.addSeparators}`);
      console.log(`    separatorStyle: ${ms.separatorStyle}`);
      console.log(`    includeFileHeaders: ${ms.includeFileHeaders}`);
      console.log(`    preserveFormatting: ${ms.preserveFormatting}`);
      console.log(`    generateHash: ${ms.generateHash}`);
      console.log(`    useTimestamp: ${ms.useTimestamp}`);
      console.log();
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

// ── validate ───────────────────────────────────────────────

program
  .command('validate <name>')
  .description('Check that all required instruction files exist')
  .action(async (name: string) => {
    const engine = new InstruxEngine();

    try {
      const config = await engine.loadConfig(name);
      const result = await engine.validate(config);

      result.warnings.forEach(w => console.log(`  ⚠  ${w}`));

      if (result.valid) {
        console.log('✅ All required files are present.');
      } else {
        console.log('❌ Missing required files:');
        result.missing.forEach(f => console.log(`  - ${f}`));
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

// ── helpers ────────────────────────────────────────────────

function printBuildResult(name: string, result: any) {
  console.log(`✅ ${name} built successfully`);
  console.log(`   Output: ${result.outputPath}`);
  console.log(`   Size:   ${result.contentLength.toLocaleString()} chars`);
  console.log(`   Hash:   ${result.contentHash}`);
}

// ── go ─────────────────────────────────────────────────────

program.parse();
