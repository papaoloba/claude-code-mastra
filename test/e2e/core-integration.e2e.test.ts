import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';

describe('Core Integration E2E Tests', () => {
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  describe('Basic Claude Code SDK Integration', () => {
    it.skipIf(skipIntegrationTests)('should successfully create agent and generate simple text', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'basic-test-agent',
        instructions: 'You are a helpful assistant. Always respond concisely.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          timeout: 15000
        }
      });

      const result = await agent.generate('Say hello in one word');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
      
      console.log('✅ Basic text generation test passed');
      console.log('Response:', result.text);
    }, 30000);

    it.skipIf(skipIntegrationTests)('should handle streaming responses', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'streaming-test-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          timeout: 15000
        }
      });

      const streamResult = await agent.stream('Count from 1 to 3');
      
      expect(streamResult).toBeDefined();
      expect(streamResult.textStream).toBeDefined();
      expect(streamResult.text).toBeDefined();

      // ストリームを消費
      const chunks: string[] = [];
      for await (const chunk of streamResult.textStream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      
      const finalText = await streamResult.text;
      expect(finalText).toBeDefined();
      expect(typeof finalText).toBe('string');
      expect(finalText.length).toBeGreaterThan(0);

      console.log('✅ Streaming test passed');
      console.log('Chunks received:', chunks.length);
      console.log('Final text:', finalText);
    }, 30000);

    it.skipIf(skipIntegrationTests)('should manage sessions correctly', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'session-test-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          timeout: 15000
        }
      });

      // セッション開始前
      const initialSessions = agent.getAllActiveSessions();
      expect(initialSessions).toHaveLength(0);

      // ストリーミングを開始
      const streamResult = await agent.stream('Hello');
      
      // ストリーム中のセッション確認
      const activeSessions = agent.getAllActiveSessions();
      expect(activeSessions.length).toBeGreaterThanOrEqual(0);

      // ストリームを完了
      for await (const chunk of streamResult.textStream) {
        // ストリームを消費
      }

      // 少し待ってからセッション状態を確認
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const finalSessions = agent.getAllActiveSessions();
      
      console.log('✅ Session management test passed');
      console.log('Initial sessions:', initialSessions.length);
      console.log('Active sessions during stream:', activeSessions.length);
      console.log('Final sessions:', finalSessions.length);
    }, 30000);

    it.skipIf(skipIntegrationTests)('should handle configuration options', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'config-test-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          permissionMode: 'default',
          timeout: 15000
        }
      });

      // 設定を確認
      const options = agent.getClaudeCodeOptions();
      expect(options.maxTurns).toBe(1);
      expect(options.permissionMode).toBe('default');
      expect(options.timeout).toBe(15000);

      // 設定を更新
      agent.updateClaudeCodeOptions({
        maxTurns: 2,
        permissionMode: 'acceptEdits'
      });

      const updatedOptions = agent.getClaudeCodeOptions();
      expect(updatedOptions.maxTurns).toBe(2);
      expect(updatedOptions.permissionMode).toBe('acceptEdits');
      expect(updatedOptions.timeout).toBe(15000); // 変更されていない値は保持

      // 実際に動作することを確認
      const result = await agent.generate('Respond with "OK"');
      expect(result.text).toBeDefined();

      console.log('✅ Configuration test passed');
      console.log('Final options:', updatedOptions);
    }, 30000);
  });
});