import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';

describe('Tools Restriction E2E Tests', () => {
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  describe('allowedTools functionality', () => {
    it.skipIf(skipIntegrationTests)('should successfully use allowed Read tool', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'read-only-agent',
        instructions: 'You are a helpful assistant that can read files.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          allowedTools: ['Read'],
          timeout: 20000
        }
      });

      const result = await agent.generate(
        'Read the package.json file and tell me the project name and version'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // プロジェクト名またはバージョンについて言及している
      const text = result.text.toLowerCase();
      const hasProjectInfo = text.includes('claude-code-mastra') || 
                            text.includes('0.0.1') ||
                            text.includes('name') ||
                            text.includes('version');
      
      expect(hasProjectInfo).toBe(true);

      console.log('✅ Read tool allowed test passed');
      console.log('Response:', result.text);
    }, 40000);

    it.skipIf(skipIntegrationTests)('should restrict disallowed tools', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'restricted-agent',
        instructions: 'You are a helpful assistant with limited tools.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          allowedTools: ['Read'], // Writeは許可されていない
          timeout: 20000
        }
      });

      const result = await agent.generate(
        'Try to create a new file called test.txt with the content "Hello World"'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // ファイル作成が制限されていることを示すメッセージが含まれている
      const text = result.text.toLowerCase();
      const isRestricted = text.includes('cannot') ||
                          text.includes('unable') ||
                          text.includes('not allowed') ||
                          text.includes('permission') ||
                          text.includes('restricted') ||
                          text.includes('don\'t have') ||
                          text.includes('cannot write') ||
                          text.includes('only read');

      expect(isRestricted).toBe(true);

      console.log('✅ Tool restriction test passed');
      console.log('Response:', result.text);
    }, 40000);
  });

  describe('disallowedTools functionality', () => {
    it.skipIf(skipIntegrationTests)('should block disallowed tools', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'no-write-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          disallowedTools: ['Write', 'Edit'], // Write/Editを禁止
          timeout: 20000
        }
      });

      const result = await agent.generate(
        'Try to write a simple Python script to a file called hello.py'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // ファイル書き込みが制限されていることを示すメッセージ
      const text = result.text.toLowerCase();
      const isBlocked = text.includes('cannot') ||
                       text.includes('unable') ||
                       text.includes('not allowed') ||
                       text.includes('permission') ||
                       text.includes('restricted') ||
                       text.includes('don\'t have') ||
                       text.includes('disallowed');

      expect(isBlocked).toBe(true);

      console.log('✅ Disallowed tools test passed');
      console.log('Response:', result.text);
    }, 40000);

    it.skipIf(skipIntegrationTests)('should allow non-disallowed tools', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'read-allowed-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          disallowedTools: ['Write'], // Writeのみ禁止、Readは許可
          timeout: 20000
        }
      });

      const result = await agent.generate(
        'Read the README.md file or any documentation file and summarize it'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // ファイル読み取りが成功していることを示す
      const text = result.text.toLowerCase();
      const isSuccessful = text.includes('readme') ||
                          text.includes('documentation') ||
                          text.includes('file') ||
                          text.includes('project') ||
                          text.includes('claude-code');

      expect(isSuccessful).toBe(true);

      console.log('✅ Non-disallowed tools test passed');
      console.log('Response:', result.text);
    }, 40000);
  });

  describe('combined restrictions', () => {
    it.skipIf(skipIntegrationTests)('should respect both allowedTools and disallowedTools', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'combined-restrictions-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          allowedTools: ['Read', 'LS'], // ReadとLSのみ許可
          disallowedTools: ['Write', 'Edit'], // WriteとEditを明示的に禁止
          timeout: 20000
        }
      });

      const result = await agent.generate(
        'List the files in the current directory and read the package.json file'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // ディレクトリリストとpackage.json内容が含まれている
      const text = result.text.toLowerCase();
      const hasDirectoryInfo = text.includes('package.json') ||
                              text.includes('src') ||
                              text.includes('test') ||
                              text.includes('file') ||
                              text.includes('directory');

      expect(hasDirectoryInfo).toBe(true);

      console.log('✅ Combined restrictions test passed');
      console.log('Response:', result.text);
    }, 40000);
  });
});