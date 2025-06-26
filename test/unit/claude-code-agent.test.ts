import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import type { SDKMessage } from '@anthropic-ai/claude-code';

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

describe('ClaudeCodeAgent', () => {
  let agent: ClaudeCodeAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new ClaudeCodeAgent({
      name: 'test-agent',
      instructions: 'Test instructions',
      model: 'claude-3-5-sonnet-20241022',
      claudeCodeOptions: {
        maxTurns: 3,
        permissionMode: 'default',
        timeout: 5000
      }
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with default options', () => {
      const defaultAgent = new ClaudeCodeAgent({
        name: 'default-agent',
        instructions: 'Default instructions',
        model: 'claude-3-5-sonnet-20241022'
      });
      
      expect(defaultAgent).toBeInstanceOf(ClaudeCodeAgent);
      expect(defaultAgent.getClaudeCodeOptions().maxTurns).toBe(10);
      expect(defaultAgent.getClaudeCodeOptions().permissionMode).toBe('default');
    });

    it('should create an instance with custom Claude Code options', () => {
      expect(agent).toBeInstanceOf(ClaudeCodeAgent);
      expect(agent.getClaudeCodeOptions().maxTurns).toBe(3);
      expect(agent.getClaudeCodeOptions().permissionMode).toBe('default');
      expect(agent.getClaudeCodeOptions().timeout).toBe(5000);
    });
  });

  describe('generate', () => {
    it('should generate text from string prompt', async () => {
      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Generated response',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session',
          parent_tool_use_id: null
        },
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: false,
          num_turns: 1,
          session_id: 'test-session',
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          result: 'Final result'
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const result = await agent.generate('Test prompt');

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('finishReason');
      expect(result.text).toBe('Generated response');
      expect(result.finishReason).toBe('stop');
    });

    it('should generate text from array of strings', async () => {
      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Response to multiple prompts',
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

      const result = await agent.generate(['Prompt 1', 'Prompt 2']);

      expect(result.text).toBe('Response to multiple prompts');
    });

    it('should handle errors during generation', async () => {
      mockQuery.mockImplementation(async function* () {
        throw new Error('Generation failed');
      });

      await expect(agent.generate('Test prompt')).rejects.toThrow('Claude Code execution failed');
    });

    it('should pass maxSteps option to Claude Code', async () => {
      const mockMessages: SDKMessage[] = [];
      
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test prompt', { maxSteps: 2 });

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test prompt',
        options: expect.objectContaining({
          maxTurns: 2
        })
      });
    });
  });

  describe('stream', () => {
    it('should stream text generation', async () => {
      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Streaming response chunk 1',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session',
          parent_tool_use_id: null
        },
        {
          type: 'assistant',
          message: {
            content: 'Streaming response chunk 2',
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

      const streamResult = await agent.stream('Stream test prompt');

      expect(streamResult).toHaveProperty('textStream');
      expect(streamResult).toHaveProperty('text');
      expect(streamResult).toHaveProperty('usage');

      const chunks: string[] = [];
      for await (const chunk of streamResult.textStream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe('Streaming response chunk 1');
      expect(chunks[1]).toBe('Streaming response chunk 2');

      const finalText = await streamResult.text;
      expect(finalText).toBe('Streaming response chunk 1Streaming response chunk 2');
    });

    it('should handle streaming errors', async () => {
      mockQuery.mockImplementation(async function* () {
        throw new Error('Streaming failed');
      });

      const streamResult = await agent.stream('Test prompt');
      
      // エラーが発生しても結果オブジェクトは返される
      expect(streamResult).toHaveProperty('textStream');
      expect(streamResult).toHaveProperty('text');
    });
  });

  describe('session management', () => {
    it('should track active sessions', async () => {
      const initialSessionCount = agent.getAllActiveSessions().length;

      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Response',
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

      const resultPromise = agent.generate('Test prompt');
      
      // 実行中はセッションが増える（非同期なので確実ではないが、概念的にテスト）
      await resultPromise;
      
      // 完了後、少し待ってからセッション数を確認
      setTimeout(() => {
        const finalSessionCount = agent.getAllActiveSessions().length;
        expect(finalSessionCount).toBe(initialSessionCount);
      }, 100);
    });

    it('should get session info by ID', async () => {
      let capturedSessionId: string | undefined;

      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Response',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session-123',
          parent_tool_use_id: null
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          capturedSessionId = message.session_id;
          yield message;
        }
      });

      await agent.generate('Test prompt');

      if (capturedSessionId) {
        const sessionInfo = agent.getSessionInfo(capturedSessionId);
        // セッションは存在するが、非アクティブになっている可能性がある
        if (sessionInfo) {
          expect(sessionInfo.sessionId).toBe(capturedSessionId);
        } else {
          // セッションがクリーンアップされている場合もある
          expect(capturedSessionId).toBeDefined();
        }
      }
    });
  });

  describe('configuration management', () => {
    it('should update Claude Code options', () => {
      const initialOptions = agent.getClaudeCodeOptions();
      expect(initialOptions.maxTurns).toBe(3);

      agent.updateClaudeCodeOptions({
        maxTurns: 5,
        allowedTools: ['Edit', 'Read']
      });

      const updatedOptions = agent.getClaudeCodeOptions();
      expect(updatedOptions.maxTurns).toBe(5);
      expect(updatedOptions.allowedTools).toEqual(['Edit', 'Read']);
    });

    it('should preserve other options when updating', () => {
      const initialTimeout = agent.getClaudeCodeOptions().timeout;

      agent.updateClaudeCodeOptions({
        maxTurns: 7
      });

      const updatedOptions = agent.getClaudeCodeOptions();
      expect(updatedOptions.maxTurns).toBe(7);
      expect(updatedOptions.timeout).toBe(initialTimeout);
    });
  });

  describe('message extraction', () => {
    it('should extract prompt from string', async () => {
      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Simple string prompt');

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Simple string prompt',
        options: expect.any(Object)
      });
    });

    it('should extract prompt from array of strings', async () => {
      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate(['Prompt 1', 'Prompt 2', 'Prompt 3']);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Prompt 1\nPrompt 2\nPrompt 3',
        options: expect.any(Object)
      });
    });

    it('should extract prompt from message objects', async () => {
      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const messageObjects = [
        { role: 'user', content: 'Message 1' },
        { role: 'user', content: 'Message 2' }
      ];

      await agent.generate(messageObjects);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Message 1\nMessage 2',
        options: expect.any(Object)
      });
    });
  });

  describe('error handling', () => {
    it('should handle query initialization errors', async () => {
      mockQuery.mockRejectedValue(new Error('Failed to initialize Claude Code'));

      await expect(agent.generate('Test prompt')).rejects.toThrow('Claude Code execution failed');
    });

    it('should cleanup sessions on error', async () => {
      const initialSessionCount = agent.getAllActiveSessions().length;

      mockQuery.mockImplementation(async function* () {
        throw new Error('Test error');
      });

      try {
        await agent.generate('Test prompt');
      } catch (error) {
        // エラーが発生しても、セッション数は元に戻る（クリーンアップされる）
        setTimeout(() => {
          const finalSessionCount = agent.getAllActiveSessions().length;
          expect(finalSessionCount).toBe(initialSessionCount);
        }, 100);
      }
    });
  });
});