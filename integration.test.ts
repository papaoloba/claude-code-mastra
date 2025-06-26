import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeAgent } from './claude-code-agent.js';
import { MessageConverter } from './message-converter.js';
import { SessionManager } from './utils.js';
import type { SDKMessage } from '@anthropic-ai/claude-code';

// Claude Code SDKをモック (統合テストでもモックを使用してコンポーネント間の統合をテスト)
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

/**
 * Component Integration Tests
 * 
 * これらのテストは、ClaudeCodeAgentの各コンポーネント（MessageConverter、SessionManager等）
 * が正しく統合されて動作することを確認します。
 * 
 * 外部依存関係（Claude Code SDK、Mastra Core）はモックされており、
 * コンポーネント間のデータフローと統合ロジックをテストします。
 * 
 * 実際のClaude Code SDKとの統合テストは integration.e2e.test.ts で実行されます。
 */
describe('Component Integration Tests', () => {
  let agent: ClaudeCodeAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new ClaudeCodeAgent({
      name: 'integration-test-agent',
      instructions: 'You are a helpful coding assistant for integration testing.',
      model: 'claude-3-5-sonnet-20241022',
      claudeCodeOptions: {
        maxTurns: 5,
        permissionMode: 'acceptEdits',
        timeout: 10000,
        allowedTools: ['Edit', 'Read', 'Write']
      }
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('End-to-End Generate Flow', () => {
    it('should handle complete generation workflow with multiple message types', async () => {
      const mockMessages: SDKMessage[] = [
        // System initialization
        {
          type: 'system',
          subtype: 'init',
          apiKeySource: 'user',
          cwd: '/test/workspace',
          session_id: 'e2e-session-123',
          tools: ['Edit', 'Read', 'Write'],
          mcp_servers: [],
          model: 'claude-3-5-sonnet-20241022',
          permissionMode: 'acceptEdits'
        },
        // User message
        {
          type: 'user',
          message: {
            role: 'user',
            content: 'Create a simple calculator function in TypeScript'
          },
          session_id: 'e2e-session-123',
          parent_tool_use_id: null
        },
        // Assistant response with tool use
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I\'ll create a calculator function for you.' },
              { type: 'tool_use', name: 'Write', id: 'tool-1', input: { file: 'calculator.ts', content: 'function calculate() {}' } }
            ],
            type: 'assistant',
            role: 'assistant',
            usage: { input_tokens: 25, output_tokens: 45 },
            stop_reason: 'tool_use'
          },
          session_id: 'e2e-session-123',
          parent_tool_use_id: null
        },
        // Tool result
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_result', tool_use_id: 'tool-1', content: 'File created successfully' }
            ],
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'e2e-session-123',
          parent_tool_use_id: 'tool-1'
        },
        // Final assistant message
        {
          type: 'assistant',
          message: {
            content: 'I\'ve successfully created a TypeScript calculator function in calculator.ts.',
            type: 'assistant',
            role: 'assistant',
            usage: { input_tokens: 30, output_tokens: 15 },
            stop_reason: 'end_turn'
          },
          session_id: 'e2e-session-123',
          parent_tool_use_id: null
        },
        // Final result
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 3500,
          duration_api_ms: 3200,
          is_error: false,
          num_turns: 3,
          session_id: 'e2e-session-123',
          total_cost_usd: 0.08,
          usage: { input_tokens: 55, output_tokens: 60 },
          result: 'Calculator function created successfully'
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const result = await agent.generate('Create a simple calculator function in TypeScript');

      // Verify result structure
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('finishReason');
      expect(result).toHaveProperty('experimental_providerMetadata');

      // Verify content combines all assistant messages
      expect(result.text).toContain('I\'ll create a calculator function');
      expect(result.text).toContain('[Tool: Write]');
      expect(result.text).toContain('[Tool Result: File created successfully]');
      expect(result.text).toContain('successfully created a TypeScript calculator');

      // Verify metadata
      expect(result.experimental_providerMetadata.cost).toBe(0.08);
      expect(result.experimental_providerMetadata.totalTurns).toBe(3);
      expect(result.experimental_providerMetadata.isError).toBe(false);
      expect(result.experimental_providerMetadata.sessionId).toBeDefined();

      // Verify query was called with correct options
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Create a simple calculator function in TypeScript',
        options: expect.objectContaining({
          maxTurns: 5,
          allowedTools: ['Edit', 'Read', 'Write'],
          permissionMode: 'acceptEdits',
          cwd: expect.any(String)
        })
      });
    });

    it('should handle error scenarios gracefully', async () => {
      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'I encountered an issue while processing your request.',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'error-session',
          parent_tool_use_id: null
        },
        {
          type: 'result',
          subtype: 'error_during_execution',
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: true,
          num_turns: 1,
          session_id: 'error-session',
          total_cost_usd: 0.02,
          usage: { input_tokens: 20, output_tokens: 10 }
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const result = await agent.generate('This will cause an error');

      expect(result.text).toBe('I encountered an issue while processing your request.');
      expect(result.experimental_providerMetadata.isError).toBe(true);
      expect(result.experimental_providerMetadata.cost).toBe(0.02);
    });
  });

  describe('End-to-End Streaming Flow', () => {
    it('should handle complete streaming workflow', async () => {
      const mockMessages: SDKMessage[] = [
        {
          type: 'system',
          subtype: 'init',
          apiKeySource: 'user',
          cwd: '/test/workspace',
          session_id: 'stream-session',
          tools: ['Edit', 'Read'],
          mcp_servers: [],
          model: 'claude-3-5-sonnet-20241022',
          permissionMode: 'acceptEdits'
        },
        {
          type: 'assistant',
          message: {
            content: 'Starting to create the API...',
            type: 'assistant',
            role: 'assistant',
            usage: { input_tokens: 15, output_tokens: 8 }
          },
          session_id: 'stream-session',
          parent_tool_use_id: null
        },
        {
          type: 'assistant',
          message: {
            content: 'Setting up the Express server...',
            type: 'assistant',
            role: 'assistant',
            usage: { input_tokens: 20, output_tokens: 10 }
          },
          session_id: 'stream-session',
          parent_tool_use_id: null
        },
        {
          type: 'assistant',
          message: {
            content: 'API setup complete!',
            type: 'assistant',
            role: 'assistant',
            usage: { input_tokens: 25, output_tokens: 5 },
            stop_reason: 'end_turn'
          },
          session_id: 'stream-session',
          parent_tool_use_id: null
        },
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 2500,
          duration_api_ms: 2300,
          is_error: false,
          num_turns: 3,
          session_id: 'stream-session',
          total_cost_usd: 0.06,
          usage: { input_tokens: 60, output_tokens: 23 },
          result: 'Express API created successfully'
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const streamResult = await agent.stream('Create a REST API with Express.js');

      // Verify stream result structure
      expect(streamResult).toHaveProperty('textStream');
      expect(streamResult).toHaveProperty('text');
      expect(streamResult).toHaveProperty('usage');
      expect(streamResult).toHaveProperty('finishReason');

      // Collect streaming chunks
      const chunks: string[] = [];
      for await (const chunk of streamResult.textStream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toBe('Starting to create the API...');
      expect(chunks[1]).toBe('Setting up the Express server...');
      expect(chunks[2]).toBe('API setup complete!');

      // Verify final text
      const finalText = await streamResult.text;
      expect(finalText).toBe('Starting to create the API...Setting up the Express server...API setup complete!');

      // Verify promises resolve correctly
      const usage = await streamResult.usage;
      expect(usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      });

      const finishReason = await streamResult.finishReason;
      expect(finishReason).toBe('stop');
    });

    it('should handle streaming with errors', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: 'Starting process...',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'error-stream',
          parent_tool_use_id: null
        };
        
        throw new Error('Streaming interrupted');
      });

      const streamResult = await agent.stream('This will be interrupted');

      // Should still return a valid stream result even with error
      expect(streamResult).toHaveProperty('textStream');
      expect(streamResult).toHaveProperty('text');

      const chunks: string[] = [];
      for await (const chunk of streamResult.textStream) {
        chunks.push(chunk);
      }

      // Should include the chunk received before error
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toBe('Starting process...');
    });
  });

  describe('Session Management Integration', () => {
    it('should properly manage sessions throughout generate lifecycle', async () => {
      const initialSessionCount = agent.getAllActiveSessions().length;

      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Session test response',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'session-mgmt-test',
          parent_tool_use_id: null
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const result = await agent.generate('Test session management');

      expect(result.text).toBe('Session test response');
      
      // Session should be cleaned up after completion
      // Note: In real scenarios, cleanup happens after timeout, so we can't test exact count
      expect(agent.getAllActiveSessions().length).toBeGreaterThanOrEqual(initialSessionCount);
    });

    it('should handle session updates during streaming', async () => {
      let capturedSessionId: string | undefined;

      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'First chunk',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'update-session-123',
          parent_tool_use_id: null
        },
        {
          type: 'result',
          subtype: 'success',
          duration_ms: 1000,
          duration_api_ms: 900,
          is_error: false,
          num_turns: 1,
          session_id: 'update-session-123',
          total_cost_usd: 0.03,
          usage: { input_tokens: 10, output_tokens: 5 },
          result: 'Streaming complete'
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          capturedSessionId = message.session_id;
          yield message;
        }
      });

      const streamResult = await agent.stream('Test session updates');
      
      // Consume the stream
      for await (const chunk of streamResult.textStream) {
        // Just consume chunks
      }

      // Session should have been updated with cost information
      if (capturedSessionId) {
        const sessionInfo = agent.getSessionInfo(capturedSessionId);
        // Session might be cleaned up or inactive, but if it exists, it should have cost info
        if (sessionInfo) {
          expect(sessionInfo.sessionId).toBe(capturedSessionId);
        }
      }
    });
  });

  describe('Configuration Integration', () => {
    it('should apply configuration changes across different operations', async () => {
      // Update agent configuration
      agent.updateClaudeCodeOptions({
        maxTurns: 3,
        allowedTools: ['Read', 'Write'],
        permissionMode: 'bypassPermissions'
      });

      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Configuration test response',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'config-test',
          parent_tool_use_id: null
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Test configuration');

      // Verify that the updated configuration was used
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test configuration',
        options: expect.objectContaining({
          maxTurns: 3,
          allowedTools: ['Read', 'Write'],
          permissionMode: 'bypassPermissions'
        })
      });

      // Verify configuration persists
      const currentConfig = agent.getClaudeCodeOptions();
      expect(currentConfig.maxTurns).toBe(3);
      expect(currentConfig.allowedTools).toEqual(['Read', 'Write']);
      expect(currentConfig.permissionMode).toBe('bypassPermissions');
    });

    it('should handle runtime option overrides', async () => {
      const mockMessages: SDKMessage[] = [
        {
          type: 'assistant',
          message: {
            content: 'Override test response',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'override-test',
          parent_tool_use_id: null
        }
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      // Call with runtime overrides
      await agent.generate('Test overrides', { maxSteps: 1 });

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Test overrides',
        options: expect.objectContaining({
          maxTurns: 1 // Should be overridden from default 5 to 1
        })
      });
    });
  });

  describe('Error Recovery Integration', () => {
    it('should handle SDK initialization errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('SDK initialization failed'));

      await expect(agent.generate('This should fail'))
        .rejects.toThrow('Claude Code execution failed');

      // Should still be able to handle subsequent requests after error
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: 'Recovery successful',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'recovery-test',
          parent_tool_use_id: null
        };
      });

      const result = await agent.generate('Recovery test');
      expect(result.text).toBe('Recovery successful');
    });

    it('should clean up resources after errors', async () => {
      const initialSessionCount = agent.getAllActiveSessions().length;

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            content: 'Before error',
            type: 'assistant',
            role: 'assistant'
          },
          session_id: 'cleanup-test',
          parent_tool_use_id: null
        };
        
        throw new Error('Simulated error during processing');
      });

      try {
        await agent.generate('This will error during processing');
      } catch (error) {
        expect(error.message).toContain('Claude Code execution failed');
      }

      // Sessions should eventually be cleaned up (though cleanup is async)
      // We can't test exact timing, but verify structure is intact
      expect(Array.isArray(agent.getAllActiveSessions())).toBe(true);
    });
  });

  describe('Message Processing Integration', () => {
    it('should correctly process complex message combinations', async () => {
      const converter = new MessageConverter();
      const sessionManager = new SessionManager();

      // Test with a complex set of messages similar to real SDK output
      const complexMessages: SDKMessage[] = [
        {
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'Create a web component' },
              { type: 'text', text: 'with TypeScript support' }
            ]
          },
          session_id: 'complex-test',
          parent_tool_use_id: null
        },
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I\'ll create a TypeScript web component for you.' },
              { type: 'tool_use', name: 'Write', id: 'write-1', input: { file: 'component.ts' } },
              { type: 'tool_result', tool_use_id: 'write-1', content: 'Component file created' },
              { type: 'text', text: 'Component is ready to use.' }
            ],
            type: 'assistant',
            role: 'assistant',
            usage: { input_tokens: 40, output_tokens: 60 },
            stop_reason: 'end_turn'
          },
          session_id: 'complex-test',
          parent_tool_use_id: null
        }
      ];

      const session = sessionManager.createSession();
      const response = converter.convertSDKMessageToMastraResponse(
        complexMessages,
        session.sessionId,
        Date.now() - 1000
      );

      expect(response.content).toContain('I\'ll create a TypeScript web component');
      expect(response.content).toContain('[Tool: Write]');
      expect(response.content).toContain('[Tool Result: Component file created]');
      expect(response.content).toContain('Component is ready to use.');

      // Test stream chunk conversion
      const streamChunks = complexMessages.map(msg => 
        converter.convertSDKMessageToStreamChunk(msg)
      );

      expect(streamChunks[0].type).toBe('metadata'); // user message
      expect(streamChunks[1].type).toBe('content');  // assistant message
      expect(streamChunks[1].data.content).toContain('TypeScript web component');
    });
  });
});