import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { z } from 'zod';
import type { ToolAction } from '@mastra/core';
import * as claudeCodeModule from '@anthropic-ai/claude-code';

// Claude Code SDKをモック
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn()
}));

describe('Tool Calls Response - Integration Tests', () => {
  const mockQuery = claudeCodeModule.query as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toolCalls field in response', () => {
    it('should return toolCalls when tools are executed', async () => {
      const mockTool = vi.fn().mockResolvedValue({ result: 'success', value: 42 });
      const tools = {
        testTool: {
          description: 'Test tool',
          inputSchema: z.object({
            input: z.string()
          }),
          execute: mockTool
        } as ToolAction
      };

      const agent = new ClaudeCodeAgent({
        name: 'toolcalls-agent',
        instructions: 'Test agent',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      let callCount = 0;
      mockQuery.mockImplementation(async function* () {
        if (callCount === 0) {
          // 初回: ツール呼び出し
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: `I'll use the test tool.\n\n\`\`\`json\n{\n  "tool": "testTool",\n  "parameters": {\n    "input": "test"\n  }\n}\`\`\``
            },
            content: `I'll use the test tool.\n\n\`\`\`json\n{\n  "tool": "testTool",\n  "parameters": {\n    "input": "test"\n  }\n}\`\`\``,
            session_id: 'test-session'
          };
        } else {
          // 2回目: ツール実行後の応答（ツール呼び出しなし）
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: 'The tool was successfully executed with result: success and value 42.'
            },
            content: 'The tool was successfully executed with result: success and value 42.',
            session_id: 'test-session'
          };
        }
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const result = await agent.generate('Use the test tool');

      // toolCallsが正しく返されることを確認
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toMatchObject({
        toolCallId: expect.stringMatching(/^tool_\d+$/),
        toolName: 'testTool',
        args: { input: 'test' },
        result: { result: 'success', value: 42 }
      });

      // experimental_providerMetadataにもツール実行情報が含まれることを確認
      expect(result.experimental_providerMetadata.toolExecutions).toBeDefined();
      expect(result.experimental_providerMetadata.toolExecutions).toHaveLength(1);
    });

    it('should return undefined toolCalls when no tools are executed', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'no-tools-agent',
        instructions: 'Test agent without tools',
        model: 'claude-3-5-sonnet-20241022',
        tools: {}
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: { role: 'assistant', content: 'This is a response without tool calls.' },
          content: 'This is a response without tool calls.',
          session_id: 'test-session'
        };
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const result = await agent.generate('Say hello');

      expect(result.toolCalls).toBeUndefined();
      expect(result.text).toBe('This is a response without tool calls.');
    });

    it('should handle multiple tool calls in sequence', async () => {
      const mockTool1 = vi.fn().mockResolvedValue({ data: 'first' });
      const mockTool2 = vi.fn().mockResolvedValue({ data: 'second' });
      
      const tools = {
        tool1: {
          description: 'First tool',
          execute: mockTool1
        } as ToolAction,
        tool2: {
          description: 'Second tool',
          execute: mockTool2
        } as ToolAction
      };

      const agent = new ClaudeCodeAgent({
        name: 'multi-tool-agent',
        instructions: 'Test multiple tools',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      let callCount = 0;
      mockQuery.mockImplementation(async function* () {
        if (callCount === 0) {
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: '```json\n{"tool": "tool1", "parameters": {}}\n```'
            },
            content: '```json\n{"tool": "tool1", "parameters": {}}\n```',
            session_id: 'test-session'
          };
        } else if (callCount === 1) {
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: 'Now tool2:\n\n```json\n{"tool": "tool2", "parameters": {}}\n```'
            },
            content: 'Now tool2:\n\n```json\n{"tool": "tool2", "parameters": {}}\n```',
            session_id: 'test-session'
          };
        } else {
          yield {
            type: 'assistant',
            message: { role: 'assistant', content: 'Both tools executed.' },
            content: 'Both tools executed.',
            session_id: 'test-session'
          };
        }
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const result = await agent.generate('Use both tools');

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].toolName).toBe('tool1');
      expect(result.toolCalls[0].result).toEqual({ data: 'first' });
      expect(result.toolCalls[1].toolName).toBe('tool2');
      expect(result.toolCalls[1].result).toEqual({ data: 'second' });
    });
  });

  describe('streaming with toolCalls', () => {
    it('should return toolCalls promise in streaming', async () => {
      const mockTool = vi.fn().mockResolvedValue({ streamed: true });
      
      const agent = new ClaudeCodeAgent({
        name: 'stream-toolcalls-agent',
        instructions: 'Test streaming with tools',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          streamTool: {
            description: 'Streaming tool',
            execute: mockTool
          } as ToolAction
        }
      });

      let callCount = 0;
      mockQuery.mockImplementation(async function* () {
        if (callCount === 0) {
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: '```json\n{"tool": "streamTool", "parameters": {}}\n```'
            },
            content: '```json\n{"tool": "streamTool", "parameters": {}}\n```',
            session_id: 'test-session'
          };
        } else {
          yield {
            type: 'assistant',
            message: { role: 'assistant', content: 'Streaming complete.' },
            content: 'Streaming complete.',
            session_id: 'test-session'
          };
        }
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const streamResult = await agent.stream('Stream with tool');
      
      // toolCallsがPromiseとして返されることを確認
      expect(streamResult.toolCalls).toBeInstanceOf(Promise);
      
      const toolCalls = await streamResult.toolCalls;
      expect(toolCalls).toBeDefined();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].toolName).toBe('streamTool');
      expect(toolCalls[0].result).toEqual({ streamed: true });
    });
  });
});