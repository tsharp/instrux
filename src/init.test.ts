/**
 * Unit tests for init functions
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { initAgent, initTemplateAgent, initRepoConfig } from './init';
import { RepoConfig } from './types';

describe('Init Functions', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'instrux-init-test-'));
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('initRepoConfig', () => {
    it('should create repo config with defaults', async () => {
      const created = await initRepoConfig(testDir);
      
      expect(created).toBe('instrux.json');
      
      const configPath = path.join(testDir, 'instrux.json');
      expect(await fs.pathExists(configPath)).toBe(true);
      
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8')) as RepoConfig;
      expect(config.agentsDirectory).toBe('agents');
      expect(config.outputDirectory).toBe('out');
      expect(config.mergeSettings).toBeDefined();
      expect(config.frontmatter).toEqual({ output: 'strip' });
      expect(config.sources).toEqual(['base/**/*.md']); // relative to agentsDirectory
    });

    it('should create repo config with custom agentsDirectory', async () => {
      const created = await initRepoConfig(testDir, 'src/agents');
      
      const configPath = path.join(testDir, 'instrux.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8')) as RepoConfig;
      
      expect(config.agentsDirectory).toBe('src/agents');
      expect(config.sources).toEqual(['base/**/*.md']); // still relative to agentsDirectory
    });

    it('should throw error if config already exists', async () => {
      await initRepoConfig(testDir);
      
      await expect(initRepoConfig(testDir)).rejects.toThrow(
        /Repository config already exists/
      );
    });
  });

  describe('initAgent', () => {
    it('should create agent structure with default directory', async () => {
      const created = await initAgent(testDir, 'MyAgent');
      
      // Should create repo config, base instructions, agent config, and specialization
      expect(created.length).toBeGreaterThan(0);
      expect(created).toContain('instrux.json');
      expect(created.some((f: string) => f.includes('agent.json'))).toBe(true);
      expect(created.some((f: string) => f.includes('specialization.md'))).toBe(true);
      
      // Verify files exist
      expect(await fs.pathExists(path.join(testDir, 'instrux.json'))).toBe(true);
      expect(await fs.pathExists(path.join(testDir, 'agents', 'MyAgent', 'agent.json'))).toBe(true);
      expect(await fs.pathExists(path.join(testDir, 'agents', 'MyAgent', 'specialization.md'))).toBe(true);
      expect(await fs.pathExists(path.join(testDir, 'agents', 'base', 'instructions.md'))).toBe(true);
    });

    it('should use custom agentsDirectory from existing repo config', async () => {
      // Create repo config with custom directory first
      const repoConfig: RepoConfig = {
        agentsDirectory: 'src/agents',
        outputDirectory: 'build',
      };
      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      const created = await initAgent(testDir, 'CustomAgent');
      
      // Should NOT create instrux.json since it exists
      expect(created).not.toContain('instrux.json');
      
      // Should create agent in src/agents
      expect(await fs.pathExists(path.join(testDir, 'src', 'agents', 'CustomAgent', 'agent.json'))).toBe(true);
      expect(await fs.pathExists(path.join(testDir, 'src', 'agents', 'base', 'instructions.md'))).toBe(true);
    });

    it('should create base instructions only once', async () => {
      await initAgent(testDir, 'Agent1');
      const created2 = await initAgent(testDir, 'Agent2');
      
      // Second init should not include base instructions or repo config
      expect(created2).not.toContain('instrux.json');
      expect(created2.some((f: string) => f.includes('base/instructions.md'))).toBe(false);
    });

    it('should throw error if agent already exists', async () => {
      await initAgent(testDir, 'MyAgent');
      
      await expect(initAgent(testDir, 'MyAgent')).rejects.toThrow(
        /Agent "MyAgent" already exists/
      );
    });

    it('should create agent config with correct paths', async () => {
      const repoConfig: RepoConfig = {
        agentsDirectory: 'custom/dir',
      };
      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      await initAgent(testDir, 'TestAgent');
      
      const configPath = path.join(testDir, 'custom', 'dir', 'TestAgent', 'agent.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      
      // Paths should use custom directory
      expect(config.files[0].path).toBe('custom/dir/base/instructions.md');
      expect(config.files[1].path).toBe('custom/dir/TestAgent/specialization.md');
    });
  });

  describe('initTemplateAgent', () => {
    it('should create template agent structure', async () => {
      const created = await initTemplateAgent(testDir, 'TemplateAgent');
      
      // Should create repo config, base files, and template agent
      expect(created).toContain('instrux.json');
      expect(created.some((f: string) => f.includes('agent.json'))).toBe(true);
      expect(created.some((f: string) => f.includes('template.md'))).toBe(true);
      expect(created.some((f: string) => f.includes('domain.md'))).toBe(true);
      
      // Base files
      expect(await fs.pathExists(path.join(testDir, 'agents', 'base', 'identity.md'))).toBe(true);
      expect(await fs.pathExists(path.join(testDir, 'agents', 'base', 'safety.md'))).toBe(true);
    });

    it('should use custom agentsDirectory for template agent', async () => {
      const repoConfig: RepoConfig = {
        agentsDirectory: 'src/agents',
      };
      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      await initTemplateAgent(testDir, 'MyTemplate');
      
      const configPath = path.join(testDir, 'src', 'agents', 'MyTemplate', 'agent.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      
      // Entry is now relative to agent directory
      expect(config.entry).toBe('template.md');
      // Sources are auto-generated, not stored in agent.json
      expect(config.sources).toBeUndefined();
    });

    it('should create base files with frontmatter', async () => {
      await initTemplateAgent(testDir, 'Test');
      
      const identityPath = path.join(testDir, 'agents', 'base', 'identity.md');
      const identity = await fs.readFile(identityPath, 'utf-8');
      
      expect(identity).toContain('---');
      expect(identity).toContain('title: Core Identity');
      expect(identity).toContain('instrux:');
      expect(identity).toContain('tags: [identity]');
    });

    it('should not recreate base files if they exist', async () => {
      await initTemplateAgent(testDir, 'Agent1');
      
      // Modify base file
      const identityPath = path.join(testDir, 'agents', 'base', 'identity.md');
      await fs.writeFile(identityPath, '# Modified');
      
      await initTemplateAgent(testDir, 'Agent2');
      
      // Base file should not be overwritten
      const identity = await fs.readFile(identityPath, 'utf-8');
      expect(identity).toBe('# Modified');
    });
  });

  describe('Auto-creating repo config', () => {
    it('should auto-create repo config on first agent init', async () => {
      const created = await initAgent(testDir, 'FirstAgent');
      
      expect(created).toContain('instrux.json');
      expect(await fs.pathExists(path.join(testDir, 'instrux.json'))).toBe(true);
    });

    it('should not recreate repo config on second agent init', async () => {
      await initAgent(testDir, 'Agent1');
      const created2 = await initAgent(testDir, 'Agent2');
      
      expect(created2).not.toContain('instrux.json');
    });

    it('should preserve existing repo config settings', async () => {
      // Manually create repo config with custom settings
      const repoConfig: RepoConfig = {
        agentsDirectory: 'my/custom/path',
        outputDirectory: 'build/output',
      };
      await fs.writeFile(
        path.join(testDir, 'instrux.json'),
        JSON.stringify(repoConfig, null, 2)
      );

      await initAgent(testDir, 'MyAgent');
      
      // Config should not be modified
      const savedConfig = JSON.parse(
        await fs.readFile(path.join(testDir, 'instrux.json'), 'utf-8')
      );
      expect(savedConfig.agentsDirectory).toBe('my/custom/path');
      expect(savedConfig.outputDirectory).toBe('build/output');
    });
  });
});
