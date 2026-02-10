/**
 * Unit tests for InstruxEngine
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { InstruxEngine } from './engine';
import { AgentConfig, RepoConfig } from './types';

describe('InstruxEngine', () => {
  let testDir: string;
  let engine: InstruxEngine;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'instrux-test-'));
    engine = new InstruxEngine(testDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(testDir);
  });

  describe('Repository Config', () => {
    it('should return null when no repo config exists', async () => {
      const config = await engine.loadRepoConfig();
      expect(config).toEqual({});
    });

    it('should load repo config when it exists', async () => {
      const repoConfig: RepoConfig = {
        agentsDirectory: 'src/agents',
        outputDirectory: 'build',
        sources: ['src/agents/base/**/*.md'],
      };

      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      const loaded = await engine.loadRepoConfig();
      expect(loaded).toMatchObject(repoConfig);
    });

    it('should use default agentsDirectory when not specified', async () => {
      const repoConfig: RepoConfig = {
        outputDirectory: 'out',
      };

      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      const loaded = await engine.loadRepoConfig();
      expect(loaded?.agentsDirectory).toBeUndefined();
    });
  });

  describe('Agent Config Loading', () => {
    it('should load agent config and merge with repo config', async () => {
      // Create repo config
      const repoConfig: RepoConfig = {
        agentsDirectory: 'agents',
        outputDirectory: 'out',
      };
      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      // Create agent config
      const agentConfig: AgentConfig = {
        name: 'TestAgent',
        description: 'Test agent',
        files: [
          { path: 'agents/base/test.md', description: 'Test file', required: true },
        ],
      };

      const agentDir = path.join(testDir, 'agents', 'TestAgent');
      await fs.ensureDir(agentDir);
      await fs.writeFile(
        path.join(agentDir, 'agent.json'),
        JSON.stringify(agentConfig, null, 2)
      );

      const resolved = await engine.loadConfig('TestAgent');
      
      expect(resolved.name).toBe('TestAgent');
      expect(resolved.agentsDirectory).toBe('agents');
      expect(resolved.outputDirectory).toBe('out');
      expect(resolved.outputFilePattern).toBe('testagent_instructions.md');
    });

    it('should use custom agentsDirectory from repo config', async () => {
      // Create repo config with custom directory
      const repoConfig: RepoConfig = {
        agentsDirectory: 'src/agents',
        outputDirectory: 'build',
      };
      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      // Create agent config in custom directory
      const agentConfig: AgentConfig = {
        name: 'CustomAgent',
        description: 'Custom agent',
        files: [],
      };

      const agentDir = path.join(testDir, 'src', 'agents', 'CustomAgent');
      await fs.ensureDir(agentDir);
      await fs.writeFile(
        path.join(agentDir, 'agent.json'),
        JSON.stringify(agentConfig, null, 2)
      );

      const resolved = await engine.loadConfig('CustomAgent');
      
      expect(resolved.agentsDirectory).toBe('src/agents');
      expect(resolved.outputDirectory).toBe('build');
    });

    it('should throw error when agent config not found', async () => {
      await expect(engine.loadConfig('NonExistent')).rejects.toThrow(
        /Agent config not found/
      );
    });
  });

  describe('List Agents', () => {
    it('should return empty array when no agents directory exists', async () => {
      const agents = await engine.listAgents();
      expect(agents).toEqual([]);
    });

    it('should list agents in default directory', async () => {
      // Create agents directory with test agent
      const agentConfig: AgentConfig = {
        name: 'Agent1',
        description: 'First agent',
        files: [],
      };

      const agentDir = path.join(testDir, 'agents', 'Agent1');
      await fs.ensureDir(agentDir);
      await fs.writeFile(
        path.join(agentDir, 'agent.json'),
        JSON.stringify(agentConfig, null, 2)
      );

      const agents = await engine.listAgents();
      
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Agent1');
      expect(agents[0].config).toBeTruthy();
    });

    it('should list agents in custom directory', async () => {
      // Create repo config with custom directory
      const repoConfig: RepoConfig = {
        agentsDirectory: 'custom/agents',
      };
      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      // Create agent in custom directory
      const agentConfig: AgentConfig = {
        name: 'CustomAgent',
        description: 'Custom agent',
        files: [],
      };

      const agentDir = path.join(testDir, 'custom', 'agents', 'CustomAgent');
      await fs.ensureDir(agentDir);
      await fs.writeFile(
        path.join(agentDir, 'agent.json'),
        JSON.stringify(agentConfig, null, 2)
      );

      const agents = await engine.listAgents();
      
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('CustomAgent');
    });

    it('should skip base directory', async () => {
      // Create base directory
      const baseDir = path.join(testDir, 'agents', 'base');
      await fs.ensureDir(baseDir);
      await fs.writeFile(
        path.join(baseDir, 'instructions.md'),
        '# Base Instructions'
      );

      // Create actual agent
      const agentConfig: AgentConfig = {
        name: 'Agent1',
        description: 'Agent',
        files: [],
      };
      const agentDir = path.join(testDir, 'agents', 'Agent1');
      await fs.ensureDir(agentDir);
      await fs.writeFile(
        path.join(agentDir, 'agent.json'),
        JSON.stringify(agentConfig, null, 2)
      );

      const agents = await engine.listAgents();
      
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Agent1');
      expect(agents.find((a: any) => a.name === 'base')).toBeUndefined();
    });

    it('should handle invalid agent config gracefully', async () => {
      const agentDir = path.join(testDir, 'agents', 'BadAgent');
      await fs.ensureDir(agentDir);
      await fs.writeFile(
        path.join(agentDir, 'agent.json'),
        'invalid json {'
      );

      const agents = await engine.listAgents();
      
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('BadAgent');
      expect(agents[0].config).toBeNull();
    });
  });

  describe('Validation', () => {
    it('should validate that required files exist', async () => {
      const config: any = {
        name: 'Test',
        description: 'Test',
        agentsDirectory: 'agents',
        outputDirectory: 'out',
        outputFilePattern: 'test.md',
        files: [
          { path: 'test.md', description: 'Test', required: true },
        ],
        mergeSettings: {},
      };

      // File does not exist
      let result = await engine.validate(config);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('test.md');

      // Create the file
      await fs.writeFile(path.join(testDir, 'test.md'), '# Test');

      // Now validation should pass
      result = await engine.validate(config);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should warn about missing optional files', async () => {
      const config: any = {
        name: 'Test',
        description: 'Test',
        agentsDirectory: 'agents',
        outputDirectory: 'out',
        outputFilePattern: 'test.md',
        files: [
          { path: 'optional.md', description: 'Optional', required: false },
        ],
        mergeSettings: {},
      };

      const result = await engine.validate(config);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Optional file not found: optional.md');
    });
  });

  describe('Simple Merge Mode', () => {
    it('should merge files in order', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.md'), '# File 1\n\nContent 1');
      await fs.writeFile(path.join(testDir, 'file2.md'), '# File 2\n\nContent 2');

      const config: any = {
        name: 'Test',
        description: 'Test',
        agentsDirectory: 'agents',
        outputDirectory: 'out',
        outputFilePattern: 'merged.md',
        files: [
          { path: 'file1.md', description: 'First', required: true },
          { path: 'file2.md', description: 'Second', required: true },
        ],
        mergeSettings: {
          addSeparators: true,
          separatorStyle: '---',
          includeFileHeaders: false,
          preserveFormatting: true,
          generateHash: false,
          useTimestamp: false,
        },
      };

      const merged = await engine.merge(config);
      
      expect(merged).toContain('# File 1');
      expect(merged).toContain('# File 2');
      expect(merged).toContain('---');
    });

    it('should skip empty files', async () => {
      await fs.writeFile(path.join(testDir, 'file1.md'), '# File 1');
      await fs.writeFile(path.join(testDir, 'empty.md'), '');

      const config: any = {
        name: 'Test',
        description: 'Test',
        agentsDirectory: 'agents',
        outputDirectory: 'out',
        outputFilePattern: 'merged.md',
        files: [
          { path: 'file1.md', description: 'First', required: true },
          { path: 'empty.md', description: 'Empty', required: false },
        ],
        mergeSettings: {
          addSeparators: false,
          separatorStyle: '---',
          includeFileHeaders: false,
          preserveFormatting: true,
          generateHash: false,
          useTimestamp: false,
        },
      };

      const merged = await engine.merge(config);
      
      expect(merged).toContain('# File 1');
      expect(merged).not.toContain('Empty');
    });
  });

  describe('Build', () => {
    it('should build simple merge mode agent', async () => {
      // Create repo config
      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify({ agentsDirectory: 'agents', outputDirectory: 'out' }, null, 2)
      );

      // Create agent
      const agentConfig: AgentConfig = {
        name: 'TestAgent',
        description: 'Test',
        files: [
          { path: 'agents/TestAgent/content.md', description: 'Content', required: true },
        ],
      };

      const agentDir = path.join(testDir, 'agents', 'TestAgent');
      await fs.ensureDir(agentDir);
      await fs.writeFile(
        path.join(agentDir, 'agent.json'),
        JSON.stringify(agentConfig, null, 2)
      );
      await fs.writeFile(
        path.join(agentDir, 'content.md'),
        '# Test Content\n\nThis is a test.'
      );

      const result = await engine.build('TestAgent');
      
      expect(result.outputPath).toContain('testagent_instructions.md');
      expect(result.filesIncluded).toBe(1);
      expect(result.contentLength).toBeGreaterThan(0);

      // Verify output file was created
      const outputPath = path.join(testDir, result.outputPath);
      expect(await fs.pathExists(outputPath)).toBe(true);
    });
  });
});
