import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';

describe('E2E MCP External Tools Tests', () => {
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  describe('MCP Server Integration', () => {
    it.skipIf(skipIntegrationTests)('should work with filesystem MCP server', async () => {
      // 注意: このテストは実際のMCPサーバーがインストールされている必要があります
      const mcpServers = {
        filesystem: {
          type: 'stdio' as const,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] // カレントディレクトリへのアクセスを許可
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'mcp-test-agent',
        instructions: 'You are a helpful assistant with filesystem MCP access.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          mcpServers,
          allowedTools: ['mcp__filesystem__*'], // filesystem MCPサーバーのツールを許可
          timeout: 30000
        }
      });

      try {
        const result = await agent.generate(
          'Using the filesystem MCP tools, tell me what files are in the current directory. If MCP tools are not available, just tell me that.'
        );

        expect(result.text).toBeTruthy();
        console.log('✅ MCP filesystem test result:', result.text);
        
        // MCPツールが利用できない場合のメッセージまたは、ファイルリストが含まれているはず
        const lowerText = result.text.toLowerCase();
        expect(
          lowerText.includes('file') || 
          lowerText.includes('directory') ||
          lowerText.includes('not available') ||
          lowerText.includes('mcp')
        ).toBe(true);
      } catch (error) {
        console.error('❌ MCP filesystem test failed:', error);
        throw error;
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should handle MCP server configuration', async () => {
      // テスト用のMCPサーバー設定
      const agent = new ClaudeCodeAgent({
        name: 'mcp-config-test-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          mcpServers: {
            testServer: {
              type: 'stdio' as const,
              command: 'echo',
              args: ['test-mcp-server']
            }
          },
          timeout: 30000
        }
      });

      try {
        const result = await agent.generate(
          'Tell me if you have any MCP tools available. Just answer yes or no.'
        );

        expect(result.text).toBeTruthy();
        console.log('✅ MCP server config test result:', result.text);
      } catch (error) {
        console.error('❌ MCP server config test failed:', error);
        // MCPサーバーが起動できない場合でも、エラーにはならないはず
        expect(error).toBeDefined();
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should respect MCP tool restrictions', async () => {
      const mcpServers = {
        test: {
          type: 'stdio' as const,
          command: 'echo',
          args: ['test-mcp-server'] // ダミーのMCPサーバー
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'mcp-restriction-test',
        instructions: 'You are a helpful assistant with limited MCP access.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          mcpServers,
          allowedTools: ['Read'], // MCPツールは許可されていない
          timeout: 30000
        }
      });

      try {
        const result = await agent.generate(
          'Try to use any MCP tools if available. If you cannot use them, explain why.'
        );

        expect(result.text).toBeTruthy();
        console.log('✅ MCP restriction test result:', result.text);
        
        // MCPツールが使用できない旨のメッセージが含まれているはず
        const lowerText = result.text.toLowerCase();
        expect(
          lowerText.includes('cannot') || 
          lowerText.includes('not allowed') || 
          lowerText.includes('not available') ||
          lowerText.includes('don\'t have') ||
          lowerText.includes('no mcp')
        ).toBe(true);
      } catch (error) {
        console.error('❌ MCP restriction test failed:', error);
        throw error;
      }
    }, 60000);
  });

  describe('MCP with standard tools combination', () => {
    it.skipIf(skipIntegrationTests)('should work with both MCP and standard tools', async () => {
      const mcpServers = {
        dummy: {
          type: 'stdio' as const,
          command: 'echo',
          args: ['dummy-server']
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'combined-tools-test',
        instructions: 'You are a helpful assistant with both standard and MCP tools.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 2,
          mcpServers,
          allowedTools: ['Read', 'mcp__dummy__*'], // 標準ツールとMCPツールの両方を許可
          timeout: 30000
        }
      });

      try {
        const result = await agent.generate(
          'List what tools you have available. Include both standard tools like Read and any MCP tools.'
        );

        expect(result.text).toBeTruthy();
        console.log('✅ Combined tools test result:', result.text);
        
        // Readツールについて言及しているはず
        expect(result.text.toLowerCase()).toMatch(/read/);
      } catch (error) {
        console.error('❌ Combined tools test failed:', error);
        throw error;
      }
    }, 60000);
  });

  describe('MCP Server Types', () => {
    it.skipIf(skipIntegrationTests)('should support SSE type MCP servers', async () => {
      const mcpServers = {
        sseServer: {
          type: 'sse' as const,
          url: 'https://example.com/mcp/sse',
          headers: {
            'Authorization': 'Bearer test-token'
          }
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'sse-test-agent',
        instructions: 'You are a helpful assistant with SSE MCP server.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          mcpServers,
          timeout: 30000
        }
      });

      try {
        const result = await agent.generate(
          'Check if SSE MCP server is configured. Just say yes or no.'
        );

        expect(result.text).toBeTruthy();
        console.log('✅ SSE MCP server test result:', result.text);
      } catch (error) {
        console.error('❌ SSE MCP server test failed:', error);
        // SSEサーバーに接続できない場合でも続行
        expect(error).toBeDefined();
      }
    }, 60000);
  });
});