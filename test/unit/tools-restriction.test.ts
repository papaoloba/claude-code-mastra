import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import type { SDKMessage, Options } from '@anthropic-ai/claude-code';

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

describe('ClaudeCodeAgent - Tools Restriction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('allowedTools', () => {
    it('should pass allowedTools to Claude Code SDK', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          allowedTools: ['Edit', 'Read', 'Write']
        }
      });

      // モックレスポンス
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

      // queryが呼ばれた際のオプションを確認
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          allowedTools: ['Edit', 'Read', 'Write']
        })
      });
    });

    it('should not include allowedTools if empty array', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          allowedTools: []
        }
      });

      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt');

      // allowedToolsが空の場合は、オプションに含まれないことを確認
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.not.objectContaining({
          allowedTools: expect.anything()
        })
      });
    });

    it('should override allowedTools when updating options', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          allowedTools: ['Edit']
        }
      });

      // オプションを更新
      agent.updateClaudeCodeOptions({
        allowedTools: ['Read', 'Write', 'Bash']
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
          allowedTools: ['Read', 'Write', 'Bash']
        })
      });
    });
  });

  describe('disallowedTools', () => {
    it('should pass disallowedTools to Claude Code SDK', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          disallowedTools: ['Bash', 'WebFetch']
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
          disallowedTools: ['Bash', 'WebFetch']
        })
      });
    });

    it('should not include disallowedTools if empty array', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          disallowedTools: []
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
        options: expect.not.objectContaining({
          disallowedTools: expect.anything()
        })
      });
    });
  });

  describe('allowedTools and disallowedTools together', () => {
    it('should pass both allowedTools and disallowedTools when specified', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          allowedTools: ['Edit', 'Read', 'Write'],
          disallowedTools: ['Bash', 'WebFetch']
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
          allowedTools: ['Edit', 'Read', 'Write'],
          disallowedTools: ['Bash', 'WebFetch']
        })
      });
    });
  });

  describe('stream method with tools restrictions', () => {
    it('should pass allowedTools in stream mode', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          allowedTools: ['Edit', 'Read']
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
          allowedTools: ['Edit', 'Read']
        })
      });
    });

    it('should pass disallowedTools in stream mode', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          disallowedTools: ['Bash']
        }
      });

      const mockMessages: SDKMessage[] = [];
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
          disallowedTools: ['Bash']
        })
      });
    });
  });

  describe('E2E-like test with actual option passing', () => {
    it('should verify the complete options object structure', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 5,
          allowedTools: ['Edit', 'Read', 'Write'],
          disallowedTools: ['Bash'],
          permissionMode: 'acceptEdits',
          cwd: '/test/dir',
          timeout: 30000
        }
      });

      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt');

      // Claude Code SDKに渡されるオプションの完全な構造を確認
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs).toMatchObject({
        prompt: 'Test prompt',
        options: {
          maxTurns: 5,
          allowedTools: ['Edit', 'Read', 'Write'],
          disallowedTools: ['Bash'],
          permissionMode: 'acceptEdits',
          cwd: '/test/dir'
        }
      });
    });
  });
});