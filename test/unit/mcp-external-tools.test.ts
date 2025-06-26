import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import type { SDKMessage, Options } from '@anthropic-ai/claude-code';
import type { McpStdioServerConfig, McpSSEServerConfig } from '../../src/types.js';

// Claude Code SDKをモック
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn()
}));

// Mastra Coreをモック
vi.mock('@mastra/core', () => ({
  Agent: class MockAgent {
    constructor(config: any) {
      this.config = config;
    }
    config: any;
  }
}));

const { query } = await import('@anthropic-ai/claude-code');
const mockQuery = vi.mocked(query);

describe('ClaudeCodeAgent - MCP External Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('MCP Servers Configuration', () => {
    it('should pass mcpServers to Claude Code SDK', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          mcpServers: {
            filesystem: {
              type: 'stdio',
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '/allowed/path']
            }
          }
        }
      });

      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Test response',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session',
          parent_tool_use_id: null
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt');

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          mcpServers: expect.objectContaining({
            filesystem: expect.objectContaining({
              type: 'stdio',
              command: 'npx'
            })
          })
        })
      });
    });

    it('should pass multiple mcpServers to Claude Code SDK', async () => {
      const mcpServers = {
        filesystem: {
          type: 'stdio' as const,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/allowed/path'],
          env: {
            FS_MODE: 'readonly'
          }
        },
        github: {
          type: 'stdio' as const,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {
            GITHUB_TOKEN: 'test-token'
          }
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          mcpServers
        }
      });

      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt');

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          mcpServers
        })
      });
    });

    it('should support SSE and HTTP type MCP servers', async () => {
      const mcpServers = {
        apiServer: {
          type: 'sse' as const,
          url: 'https://api.example.com/mcp',
          headers: {
            'Authorization': 'Bearer token123'
          }
        },
        httpServer: {
          type: 'http' as const,
          url: 'https://http.example.com/mcp',
          headers: {
            'X-API-Key': 'key123'
          }
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          mcpServers
        }
      });

      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt');

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          mcpServers
        })
      });
    });

    it('should validate MCP servers structure', () => {
      const invalidConfigs = [
        { server1: {} }, // missing type
        { server1: { type: 'invalid' } }, // invalid type
        { server1: { type: 'stdio' } }, // missing command for stdio
        { server1: { type: 'stdio', command: 123 } }, // command not string
        { server1: { type: 'sse' } }, // missing url for sse
        { server1: { type: 'http', url: 123 } }, // url not string
      ];

      for (const invalidConfig of invalidConfigs) {
        expect(() => {
          new ClaudeCodeAgent({
            name: 'test-agent',
            instructions: 'Test',
            model: 'claude-3-5-sonnet-20241022',
            claudeCodeOptions: {
              mcpServers: invalidConfig as any
            }
          });
        }).toThrow();
      }
    });
  });

  describe('MCP with allowedTools', () => {
    it('should allow MCP tools when specified in allowedTools', async () => {
      const mcpServers = {
        custom: {
          type: 'stdio' as const,
          command: 'node',
          args: ['custom-server.js']
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          mcpServers,
          allowedTools: ['Read', 'Write', 'mcp__custom__*'] // MCPツールを許可
        }
      });

      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt');

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options).toHaveProperty('mcpServers', mcpServers);
      expect(callArgs.options).toHaveProperty('allowedTools');
      expect(callArgs.options.allowedTools).toContain('mcp__custom__*');
    });
  });

  describe('MCP Configuration in stream mode', () => {
    it('should pass mcpServers in stream mode', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          mcpServers: {
            test: {
              type: 'stdio',
              command: 'test-server'
            }
          }
        }
      });

      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Stream response',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session',
          parent_tool_use_id: null
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const streamResult = await agent.stream('Test prompt');
      
      // ストリームを消費
      for await (const chunk of streamResult.textStream) {
        // チャンクを読む
      }

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          mcpServers: expect.objectContaining({
            test: expect.objectContaining({
              type: 'stdio',
              command: 'test-server'
            })
          })
        })
      });
    });
  });

  describe('updateClaudeCodeOptions with MCP', () => {
    it('should update mcpServers through updateClaudeCodeOptions', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022'
      });

      const newMcpServers = {
        database: {
          type: 'stdio' as const,
          command: 'node',
          args: ['db-server.js'],
          env: {
            DB_CONNECTION: 'postgresql://localhost:5432/test'
          }
        }
      };

      agent.updateClaudeCodeOptions({
        mcpServers: newMcpServers
      });

      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt');

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          mcpServers: newMcpServers
        })
      });
    });
  });

  describe('Complete MCP integration example', () => {
    it('should work with full configuration including MCP, allowed tools, and other options', async () => {
      const mcpServers = {
        filesystem: {
          type: 'stdio' as const,
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace']
        },
        search: {
          type: 'stdio' as const,
          command: 'python',
          args: ['search-server.py'],
          env: {
            SEARCH_API_KEY: 'test-key'
          }
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 5,
          mcpServers,
          allowedTools: ['Read', 'Write', 'mcp__filesystem__*', 'mcp__search__query'],
          disallowedTools: ['Bash'],
          permissionMode: 'acceptEdits',
          timeout: 60000
        }
      });

      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt with MCP tools');

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs).toMatchObject({
        prompt: 'Test prompt with MCP tools',
        options: {
          maxTurns: 5,
          mcpServers,
          allowedTools: ['Read', 'Write', 'mcp__filesystem__*', 'mcp__search__query'],
          disallowedTools: ['Bash'],
          permissionMode: 'acceptEdits'
        }
      });
    });
  });
});