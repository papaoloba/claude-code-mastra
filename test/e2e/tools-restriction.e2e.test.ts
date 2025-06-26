import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';

describe('E2E Tools Restriction Tests', () => {
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  describe('allowedTools restrictions', () => {
    it.skipIf(skipIntegrationTests)('should only use allowed tools', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'allowed-tools-test',
        instructions: 'You are a helpful assistant that can only read files.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          allowedTools: ['Read'], // Readツールのみ許可
          timeout: 30000
        }
      });

      try {
        // Readツールのみで実行可能なタスクをリクエスト
        const result = await agent.generate(
          'Tell me what the package.json file contains. Just describe the main fields.'
        );

        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(0);
        
        // package.jsonに関する情報が含まれているはず
        expect(result.text.toLowerCase()).toMatch(/package|json|name|version|dependencies/);
        
        console.log('✅ Allowed tools test passed');
      } catch (error) {
        console.error('❌ Allowed tools test failed:', error);
        throw error;
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should fail when trying to use disallowed tools', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'restricted-tools-test',
        instructions: 'You are a helpful assistant with limited tools.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          allowedTools: ['Read'], // Readツールのみ許可
          timeout: 30000
        }
      });

      try {
        // 許可されていないツール（Write）を要求するタスク
        const result = await agent.generate(
          'Try to create a new file called test.txt with the content "Hello World". If you cannot write files, just tell me that writing is not allowed.'
        );

        expect(result.text).toBeTruthy();
        
        // ファイル作成ができない旨のメッセージが含まれているはず
        const lowerText = result.text.toLowerCase();
        expect(
          lowerText.includes('cannot') || 
          lowerText.includes('not allowed') || 
          lowerText.includes('unable') ||
          lowerText.includes('only read') ||
          lowerText.includes('don\'t have access')
        ).toBe(true);
        
        console.log('✅ Tool restriction enforcement test passed');
        console.log('Response:', result.text);
      } catch (error) {
        console.error('❌ Tool restriction test failed:', error);
        throw error;
      }
    }, 60000);
  });

  describe('disallowedTools restrictions', () => {
    it.skipIf(skipIntegrationTests)('should not use disallowed tools', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'disallowed-tools-test',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          disallowedTools: ['Bash', 'WebFetch'], // BashとWebFetchを禁止
          timeout: 30000
        }
      });

      try {
        // 禁止されたツール（Bash）を使用しようとするタスク
        const result = await agent.generate(
          'Try to run the command "echo Hello World" using bash. If bash is not available, tell me that bash commands are not allowed.'
        );

        expect(result.text).toBeTruthy();
        
        // Bashが使用できない旨のメッセージが含まれているはず
        const lowerText = result.text.toLowerCase();
        expect(
          lowerText.includes('cannot') || 
          lowerText.includes('not allowed') || 
          lowerText.includes('unable') ||
          lowerText.includes('not available') ||
          lowerText.includes('don\'t have access')
        ).toBe(true);
        
        console.log('✅ Disallowed tools test passed');
        console.log('Response:', result.text);
      } catch (error) {
        console.error('❌ Disallowed tools test failed:', error);
        throw error;
      }
    }, 60000);
  });

  describe('combined allowed and disallowed tools', () => {
    it.skipIf(skipIntegrationTests)('should respect both allowed and disallowed tools', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'combined-tools-test',
        instructions: 'You are a helpful file assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          allowedTools: ['Read', 'Write', 'Edit'], // ファイル操作のみ許可
          disallowedTools: ['Bash', 'WebFetch'], // コマンド実行とWeb取得を禁止
          timeout: 30000
        }
      });

      try {
        // 許可されたツールのみで実行可能なタスク
        const result = await agent.generate(
          'List the files in the src directory and tell me what you find. Use only file reading tools.'
        );

        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(0);
        
        // srcディレクトリの内容に関する情報が含まれているはず
        expect(result.text.toLowerCase()).toMatch(/src|file|directory|\.ts/);
        
        console.log('✅ Combined tools restriction test passed');
      } catch (error) {
        console.error('❌ Combined tools test failed:', error);
        throw error;
      }
    }, 60000);
  });
});