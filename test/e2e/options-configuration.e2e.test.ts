import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';

describe('Options Configuration E2E Tests', () => {
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  describe('maxTurns Configuration', () => {
    it.skipIf(skipIntegrationTests)('should respect maxTurns limit', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'max-turns-test-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1, // 1ターンのみ許可
          timeout: 15000
        }
      });

      const result = await agent.generate(
        'Count from 1 to 10, then explain why numbers are important'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // 1ターンで完了しているため、完全な応答が返される
      console.log('✅ MaxTurns test passed');
      console.log('Response length:', result.text.length);
      console.log('Response preview:', result.text.substring(0, 200) + '...');
    }, 30000);

    it.skipIf(skipIntegrationTests)('should work with higher maxTurns', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'multi-turns-test-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 3, // 3ターンまで許可
          timeout: 25000
        }
      });

      const result = await agent.generate(
        'Help me understand this project by reading the package.json and listing the main source files'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      console.log('✅ Multi-turns test passed');
      console.log('Response length:', result.text.length);
    }, 40000);
  });

  describe('Permission Mode Configuration', () => {
    it.skipIf(skipIntegrationTests)('should work with default permission mode', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'default-permission-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          permissionMode: 'default',
          timeout: 20000
        }
      });

      const result = await agent.generate(
        'List the contents of the current directory'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // ディレクトリの内容について何らかの情報が含まれている
      const text = result.text.toLowerCase();
      const hasDirectoryInfo = text.includes('package.json') ||
                              text.includes('src') ||
                              text.includes('test') ||
                              text.includes('file') ||
                              text.includes('directory');

      expect(hasDirectoryInfo).toBe(true);

      console.log('✅ Default permission mode test passed');
      console.log('Response:', result.text);
    }, 35000);

    it.skipIf(skipIntegrationTests)('should work with acceptEdits permission mode', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'accept-edits-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          permissionMode: 'acceptEdits',
          timeout: 20000
        }
      });

      const result = await agent.generate(
        'Read the package.json file and describe the project'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // プロジェクトについての情報が含まれている
      const text = result.text.toLowerCase();
      const hasProjectInfo = text.includes('claude-code-mastra') ||
                            text.includes('typescript') ||
                            text.includes('mastra') ||
                            text.includes('integration') ||
                            text.includes('project');

      expect(hasProjectInfo).toBe(true);

      console.log('✅ Accept edits permission mode test passed');
      console.log('Response:', result.text);
    }, 35000);
  });

  describe('Timeout Configuration', () => {
    it.skipIf(skipIntegrationTests)('should complete within timeout', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'timeout-test-agent',
        instructions: 'You are a helpful assistant. Always respond concisely.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          timeout: 10000 // 10秒のタイムアウト
        }
      });

      const startTime = Date.now();
      
      const result = await agent.generate('Say hello');

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // 10秒以内に完了している
      expect(duration).toBeLessThan(10000);

      console.log('✅ Timeout test passed');
      console.log('Duration:', duration, 'ms');
      console.log('Response:', result.text);
    }, 20000);
  });

  describe('Model Configuration', () => {
    it.skipIf(skipIntegrationTests)('should work with specified model', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'model-test-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022', // 明示的にモデルを指定
        claudeCodeOptions: {
          maxTurns: 1,
          timeout: 15000
        }
      });

      const result = await agent.generate('What is 2 + 2?');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // 計算結果が含まれている
      const text = result.text.toLowerCase();
      const hasAnswer = text.includes('4') || text.includes('four');

      expect(hasAnswer).toBe(true);

      console.log('✅ Model configuration test passed');
      console.log('Response:', result.text);
    }, 25000);
  });

  describe('Dynamic Configuration Updates', () => {
    it.skipIf(skipIntegrationTests)('should handle configuration updates', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'dynamic-config-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          permissionMode: 'default',
          timeout: 15000
        }
      });

      // 初期設定を確認
      const initialOptions = agent.getClaudeCodeOptions();
      expect(initialOptions.maxTurns).toBe(1);
      expect(initialOptions.permissionMode).toBe('default');

      // 設定を更新
      agent.updateClaudeCodeOptions({
        maxTurns: 2,
        permissionMode: 'acceptEdits',
        timeout: 20000
      });

      // 更新された設定を確認
      const updatedOptions = agent.getClaudeCodeOptions();
      expect(updatedOptions.maxTurns).toBe(2);
      expect(updatedOptions.permissionMode).toBe('acceptEdits');
      expect(updatedOptions.timeout).toBe(20000);

      // 更新された設定で動作することを確認
      const result = await agent.generate('List files and read package.json');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      console.log('✅ Dynamic configuration update test passed');
      console.log('Final options:', updatedOptions);
      console.log('Response preview:', result.text.substring(0, 200) + '...');
    }, 35000);
  });
});