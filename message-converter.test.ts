import { describe, it, expect, beforeEach } from 'vitest';
import { MessageConverter } from './message-converter.js';
import type { SDKMessage } from '@anthropic-ai/claude-code';

describe('MessageConverter', () => {
  let converter: MessageConverter;

  beforeEach(() => {
    converter = new MessageConverter();
  });

  describe('convertSDKMessageToMastraResponse', () => {
    it('should convert assistant messages to Mastra response', () => {
      const messages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Hello, this is a test response.',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session-123',
          parent_tool_use_id: null
        },
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 1500,
          duration_api_ms: 1200,
          is_error: false,
          num_turns: 1,
          session_id: 'test-session-123',
          total_cost_usd: 0.05,
          usage: { input_tokens: 15, output_tokens: 25 },
          result: 'Task completed successfully'
        }
      ];

      const startTime = Date.now() - 2000;
      const result = converter.convertSDKMessageToMastraResponse(
        messages,
        'test-session-123',
        startTime
      );

      expect(result.content).toBe('Hello, this is a test response.');
      expect(result.metadata?.sessionId).toBe('test-session-123');
      expect(result.metadata?.cost).toBe(0.05);
      expect(result.metadata?.totalTurns).toBe(1);
      expect(result.metadata?.isError).toBe(false);
      expect(result.metadata?.duration).toBeGreaterThan(0);
    });

    it('should handle multiple assistant messages', () => {
      const messages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'First response.',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session',
          parent_tool_use_id: null
        },
        {
          type: 'assistant',
          message: {
            content: 'Second response.',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session',
          parent_tool_use_id: null
        }
      ];

      const result = converter.convertSDKMessageToMastraResponse(
        messages,
        'test-session',
        Date.now()
      );

      expect(result.content).toBe('First response.\n\nSecond response.');
    });

    it('should handle array content in messages', () => {
      const messages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Text content' },
              { type: 'tool_use', name: 'TestTool', id: 'tool-1' },
              { type: 'tool_result', content: 'Tool executed', tool_use_id: 'tool-1' }
            ],
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'test-session',
          parent_tool_use_id: null
        }
      ];

      const result = converter.convertSDKMessageToMastraResponse(
        messages,
        'test-session',
        Date.now()
      );

      expect(result.content).toContain('Text content');
      expect(result.content).toContain('[Tool: TestTool]');
      expect(result.content).toContain('[Tool Result: Tool executed]');
    });

    it('should use result message when no assistant messages', () => {
      const messages: SDKMessage[] = [
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: false,
          num_turns: 0,
          session_id: 'test-session',
          total_cost_usd: 0.01,
          usage: { input_tokens: 5, output_tokens: 10 },
          result: 'Direct result without assistant messages'
        }
      ];

      const result = converter.convertSDKMessageToMastraResponse(
        messages,
        'test-session',
        Date.now()
      );

      expect(result.content).toBe('Direct result without assistant messages');
    });

    it('should handle error results', () => {
      const messages: SDKMessage[] = [
        {
          type: 'result',
          subtype: 'error_during_execution',
          duration_ms: 500,
          duration_api_ms: 200,
          is_error: true,
          num_turns: 1,
          session_id: 'test-session',
          total_cost_usd: 0.02,
          usage: { input_tokens: 10, output_tokens: 0 }
        }
      ];

      const result = converter.convertSDKMessageToMastraResponse(
        messages,
        'test-session',
        Date.now()
      );

      expect(result.metadata?.isError).toBe(true);
      expect(result.metadata?.cost).toBe(0.02);
    });
  });

  describe('convertSDKMessageToStreamChunk', () => {
    it('should convert assistant message to content chunk', () => {
      const message: SDKMessage = {
        type: 'assistant',
        message: {
          content: 'Streaming content',
          type: 'assistant',
          role: 'assistant',
          usage: { input_tokens: 10, output_tokens: 15 },
          stop_reason: 'end_turn'
        },
        session_id: 'stream-session',
        parent_tool_use_id: null
      };

      const chunk = converter.convertSDKMessageToStreamChunk(message);

      expect(chunk.type).toBe('content');
      expect(chunk.data.content).toBe('Streaming content');
      expect(chunk.data.sessionId).toBe('stream-session');
      expect(chunk.data.usage).toEqual({ input_tokens: 10, output_tokens: 15 });
      expect(chunk.data.stopReason).toBe('end_turn');
    });

    it('should convert user message to metadata chunk', () => {
      const message: SDKMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: 'User input message'
        },
        session_id: 'stream-session',
        parent_tool_use_id: null
      };

      const chunk = converter.convertSDKMessageToStreamChunk(message);

      expect(chunk.type).toBe('metadata');
      expect(chunk.data.userMessage).toBe('User input message');
      expect(chunk.data.sessionId).toBe('stream-session');
    });

    it('should convert result message to complete chunk', () => {
      const message: SDKMessage = {
        type: 'result',
        subtype: 'success',
        duration_ms: 2000,
        duration_api_ms: 1800,
        is_error: false,
        num_turns: 3,
        session_id: 'stream-session',
        total_cost_usd: 0.08,
        usage: { input_tokens: 50, output_tokens: 100 },
        result: 'Final streaming result'
      };

      const chunk = converter.convertSDKMessageToStreamChunk(message);

      expect(chunk.type).toBe('complete');
      expect(chunk.data.result).toBe('Final streaming result');
      expect(chunk.data.totalCost).toBe(0.08);
      expect(chunk.data.sessionId).toBe('stream-session');
      expect(chunk.data.isError).toBe(false);
      expect(chunk.data.duration).toBe(2000);
    });

    it('should convert system message to metadata chunk', () => {
      const message: SDKMessage = {
        type: 'system',
        subtype: 'init',
        apiKeySource: 'user',
        cwd: '/test/directory',
        session_id: 'system-session',
        tools: ['Edit', 'Read', 'Write'],
        mcp_servers: [],
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'default'
      };

      const chunk = converter.convertSDKMessageToStreamChunk(message);

      expect(chunk.type).toBe('metadata');
      expect(chunk.data.systemInfo).toEqual({
        cwd: '/test/directory',
        tools: ['Edit', 'Read', 'Write'],
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'default'
      });
      expect(chunk.data.sessionId).toBe('system-session');
    });

    it('should handle user messages with array content', () => {
      const message: SDKMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'Text part' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'base64data' } }
          ]
        },
        session_id: 'user-session',
        parent_tool_use_id: null
      };

      const chunk = converter.convertSDKMessageToStreamChunk(message);

      expect(chunk.type).toBe('metadata');
      expect(chunk.data.userMessage).toBe('Text part\n[Image]');
    });
  });

  describe('createErrorChunk', () => {
    it('should create error chunk from Error object', () => {
      const error = new Error('Test error message');
      const chunk = converter.createErrorChunk(error, 'error-session');

      expect(chunk.type).toBe('error');
      expect(chunk.data.error.code).toBe('CLAUDE_CODE_ERROR');
      expect(chunk.data.error.message).toBe('Test error message');
      expect(chunk.data.error.originalError).toBe(error);
      expect(chunk.data.sessionId).toBe('error-session');
    });

    it('should create error chunk from string', () => {
      const errorMessage = 'String error message';
      const chunk = converter.createErrorChunk(errorMessage);

      expect(chunk.type).toBe('error');
      expect(chunk.data.error.code).toBe('CLAUDE_CODE_ERROR');
      expect(chunk.data.error.message).toBe(errorMessage);
      expect(chunk.data.error.originalError).toBeUndefined();
      expect(chunk.data.sessionId).toBeUndefined();
    });
  });

  describe('createMetadataChunk', () => {
    it('should create metadata chunk with custom data', () => {
      const metadata = {
        status: 'started',
        timestamp: Date.now(),
        custom: 'value'
      };

      const chunk = converter.createMetadataChunk(metadata, 'meta-session');

      expect(chunk.type).toBe('metadata');
      expect(chunk.data.status).toBe('started');
      expect(chunk.data.timestamp).toBeDefined();
      expect(chunk.data.custom).toBe('value');
      expect(chunk.data.sessionId).toBe('meta-session');
    });

    it('should create metadata chunk without session ID', () => {
      const metadata = { info: 'test' };
      const chunk = converter.createMetadataChunk(metadata);

      expect(chunk.type).toBe('metadata');
      expect(chunk.data.info).toBe('test');
      expect(chunk.data.sessionId).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages array', () => {
      const result = converter.convertSDKMessageToMastraResponse(
        [],
        'empty-session',
        Date.now()
      );

      expect(result.content).toBe('');
      expect(result.metadata?.sessionId).toBe('empty-session');
      expect(result.metadata?.totalTurns).toBe(0);
    });

    it('should handle message with undefined content', () => {
      const message: SDKMessage = {
        type: 'assistant',
        message: {
          content: undefined as any,
          type: 'assistant',
          role: 'assistant'
        },
        session_id: 'undefined-content',
        parent_tool_use_id: null
      };

      const chunk = converter.convertSDKMessageToStreamChunk(message);

      expect(chunk.type).toBe('content');
      expect(chunk.data.content).toBe('');
    });

    it('should handle malformed array content', () => {
      const message: SDKMessage = {
        type: 'assistant',
        message: {
          content: [
            { type: 'text' }, // missing text property
            { type: 'unknown', data: 'test' } as any, // unknown type
            null as any // null item
          ],
          type: 'assistant',
          role: 'assistant'
        },
        session_id: 'malformed-session',
        parent_tool_use_id: null
      };

      const chunk = converter.convertSDKMessageToStreamChunk(message);

      expect(chunk.type).toBe('content');
      expect(typeof chunk.data.content).toBe('string');
    });

    it('should handle result message without result property', () => {
      const message: SDKMessage = {
        type: 'result',
        subtype: 'error_max_turns',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: true,
        num_turns: 5,
        session_id: 'no-result',
        total_cost_usd: 0.1,
        usage: { input_tokens: 100, output_tokens: 0 }
        // no result property
      };

      const chunk = converter.convertSDKMessageToStreamChunk(message);

      expect(chunk.type).toBe('complete');
      expect(chunk.data.result).toBeUndefined();
      expect(chunk.data.isError).toBe(true);
    });
  });
});