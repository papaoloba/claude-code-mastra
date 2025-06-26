import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';

// 実際のClaude Code SDKを使用（モックなし）
// 注意: このテストは実際のClaude Code環境が必要です

describe('E2E Integration Tests', () => {
  let agent: ClaudeCodeAgent;
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  beforeEach(() => {
    agent = new ClaudeCodeAgent({
      name: 'e2e-test-agent',
      instructions: 'You are a helpful coding assistant for E2E testing. Keep responses concise.',
      model: 'claude-3-5-sonnet-20241022',
      claudeCodeOptions: {
        maxTurns: 2,
        permissionMode: 'default',
        timeout: 30000,
        allowedTools: ['Read']
      }
    });
  });

  describe('Real Claude Code SDK Integration', () => {
    it.skipIf(skipIntegrationTests)('should generate text using real Claude Code SDK', async () => {
      try {
        const result = await agent.generate('What is 2 + 2? Answer with just the number.');

        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('usage');
        expect(result).toHaveProperty('finishReason');
        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(0);
        expect(result.finishReason).toBe('stop');

        console.log('✅ Generate test result:', result.text);
      } catch (error) {
        console.error('❌ Generate test failed:', error);
        throw error;
      }
    }, 60000); // 60秒タイムアウト

    it.skipIf(skipIntegrationTests)('should handle streaming with real Claude Code SDK', async () => {
      try {
        const streamResult = await agent.stream('Count from 1 to 3, one number per line.');

        expect(streamResult).toHaveProperty('textStream');
        expect(streamResult).toHaveProperty('text');
        expect(streamResult).toHaveProperty('usage');

        const chunks: string[] = [];
        for await (const chunk of streamResult.textStream) {
          chunks.push(chunk);
          console.log('📦 Received chunk:', chunk);
        }

        expect(chunks.length).toBeGreaterThan(0);

        const finalText = await streamResult.text;
        expect(finalText).toBeTruthy();
        expect(finalText.length).toBeGreaterThan(0);

        console.log('✅ Stream test completed. Final text:', finalText);
      } catch (error) {
        console.error('❌ Stream test failed:', error);
        throw error;
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should handle simple file operations', async () => {
      try {
        const result = await agent.generate('List the files in the current directory using the Read tool.');

        expect(result.text).toBeTruthy();
        expect(result.experimental_providerMetadata).toBeDefined();

        console.log('✅ File operation test result:', result.text.substring(0, 200) + '...');
      } catch (error) {
        console.error('❌ File operation test failed:', error);
        throw error;
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should manage sessions properly in real environment', async () => {
      try {
        const initialSessionCount = agent.getAllActiveSessions().length;

        const result1 = await agent.generate('Say hello');
        expect(result1.text).toBeTruthy();

        const result2 = await agent.generate('Say goodbye');
        expect(result2.text).toBeTruthy();

        // セッションが適切に管理されていることを確認
        const currentSessionCount = agent.getAllActiveSessions().length;
        expect(currentSessionCount).toBeGreaterThanOrEqual(initialSessionCount);

        console.log('✅ Session management test completed');
        console.log('  - Initial sessions:', initialSessionCount);
        console.log('  - Current sessions:', currentSessionCount);
      } catch (error) {
        console.error('❌ Session management test failed:', error);
        throw error;
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should handle configuration updates', async () => {
      try {
        // 設定を更新
        agent.updateClaudeCodeOptions({
          maxTurns: 1,
          allowedTools: ['Read'],
          permissionMode: 'default'
        });

        const updatedOptions = agent.getClaudeCodeOptions();
        expect(updatedOptions.maxTurns).toBe(1);
        expect(updatedOptions.allowedTools).toEqual(['Read']);

        const result = await agent.generate('What tools are available to you?');
        expect(result.text).toBeTruthy();

        console.log('✅ Configuration test completed:', result.text.substring(0, 100) + '...');
      } catch (error) {
        console.error('❌ Configuration test failed:', error);
        throw error;
      }
    }, 60000);
  });

  describe('Error Handling with Real SDK', () => {
    it.skipIf(skipIntegrationTests)('should handle invalid requests gracefully', async () => {
      try {
        // 無効なツールを要求
        const agentWithInvalidTools = new ClaudeCodeAgent({
          name: 'invalid-tools-agent',
          instructions: 'You are a test agent.',
          model: 'claude-3-5-sonnet-20241022',
          claudeCodeOptions: {
            maxTurns: 1,
            allowedTools: ['NonExistentTool'],
            timeout: 15000
          }
        });

        // 実際のSDKでの動作を確認
        const result = await agentWithInvalidTools.generate('Use the NonExistentTool to do something.');
        
        // エラーになるかもしれないし、ツールが使えないと言うかもしれない
        expect(result).toBeDefined();
        console.log('✅ Invalid tools test result:', result.text.substring(0, 100) + '...');
      } catch (error) {
        // エラーになることも想定される
        console.log('⚠️  Invalid tools test threw error (expected):', error.message);
        expect(error).toBeDefined();
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should handle timeout scenarios', async () => {
      try {
        const shortTimeoutAgent = new ClaudeCodeAgent({
          name: 'timeout-test-agent',
          instructions: 'You are a test agent.',
          model: 'claude-3-5-sonnet-20241022',
          claudeCodeOptions: {
            maxTurns: 1,
            timeout: 1000 // 1秒の短いタイムアウト
          }
        });

        // 複雑なタスクでタイムアウトを誘発
        const result = await shortTimeoutAgent.generate('Perform a very complex analysis of all files in the system.');
        
        // タイムアウトするかもしれないし、早く応答するかもしれない
        expect(result).toBeDefined();
        console.log('✅ Timeout test completed without timeout');
      } catch (error) {
        // タイムアウトエラーが発生することも想定される
        console.log('⚠️  Timeout test threw error:', error.message);
        expect(error.message).toMatch(/timeout|failed/i);
      }
    }, 30000);
  });

  describe('Performance Tests', () => {
    it.skipIf(skipIntegrationTests)('should handle multiple concurrent requests', async () => {
      try {
        const promises = [
          agent.generate('What is 1 + 1?'),
          agent.generate('What is 2 + 2?'),
          agent.generate('What is 3 + 3?')
        ];

        const results = await Promise.all(promises);

        results.forEach((result, index) => {
          expect(result.text).toBeTruthy();
          console.log(`✅ Concurrent request ${index + 1} completed:`, result.text.substring(0, 50) + '...');
        });

        console.log('✅ All concurrent requests completed successfully');
      } catch (error) {
        console.error('❌ Concurrent requests test failed:', error);
        throw error;
      }
    }, 120000); // 2分タイムアウト

    it.skipIf(skipIntegrationTests)('should measure response time', async () => {
      try {
        const startTime = Date.now();
        
        const result = await agent.generate('Hello, respond with just "Hi"');
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(result.text).toBeTruthy();
        expect(responseTime).toBeLessThan(30000); // 30秒以内に応答

        console.log('✅ Response time test completed');
        console.log('  - Response time:', responseTime, 'ms');
        console.log('  - Response:', result.text);
      } catch (error) {
        console.error('❌ Response time test failed:', error);
        throw error;
      }
    }, 60000);
  });
});

// E2Eテスト実行のヘルパー
export function runE2ETests() {
  if (!process.env.CLAUDE_CODE_E2E_TEST) {
    console.log(`
🔧 E2E Integration Tests Setup:

To run these tests with the real Claude Code SDK:

1. Ensure Claude Code is installed and configured:
   - npm install -g @anthropic-ai/claude-code
   - claude login

2. Set the environment variable:
   - export CLAUDE_CODE_E2E_TEST=true

3. Run the tests:
   - npm run test:e2e

Note: These tests require:
- Active internet connection
- Valid Anthropic API key
- Claude Code CLI properly configured
- May consume API credits
    `);
    return false;
  }
  return true;
}