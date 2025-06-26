import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import * as claudeCodeModule from '@anthropic-ai/claude-code';

// Claude Code SDKをモック
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn()
}));

describe('Tool Execution Flow - Integration Tests', () => {
  const mockQuery = claudeCodeModule.query as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool call detection and execution', () => {
    it('should detect tool call in response and execute it', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ result: 42 });
      const calculator = createTool({
        id: 'calculator',
        description: 'Calculate math expressions',
        inputSchema: z.object({
          expression: z.string()
        }),
        execute: mockExecute
      });
      const tools = {
        calculator
      };

      const agent = new ClaudeCodeAgent({
        name: 'calc-agent',
        instructions: 'You are a calculator assistant',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      // 最初の反応でツール呼び出しを返す
      let callCount = 0;
      mockQuery.mockImplementation(async function* (args: any) {
        if (callCount === 0) {
          // 最初の呼び出し: ツール使用を指示
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: `I'll calculate that for you.

\`\`\`json
{
  "tool": "calculator",
  "parameters": {
    "expression": "10 * 4.2"
  }
}
\`\`\``
            },
            content: `I'll calculate that for you.

\`\`\`json
{
  "tool": "calculator",
  "parameters": {
    "expression": "10 * 4.2"
  }
}
\`\`\``,
            session_id: 'test-session'
          };
          yield {
            type: 'result',
            total_cost_usd: 0.001,
            is_error: false
          };
        } else {
          // 2回目の呼び出し: ツール結果を使った応答
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: 'Based on the calculation, 10 * 4.2 equals 42.'
            },
            content: 'Based on the calculation, 10 * 4.2 equals 42.',
            session_id: 'test-session'
          };
          yield {
            type: 'result',
            total_cost_usd: 0.001,
            is_error: false
          };
        }
      });

      const result = await agent.generate('What is 10 times 4.2?');

      // ツールが実行されたことを確認
      expect(mockExecute).toHaveBeenCalledWith(
        { context: { expression: '10 * 4.2' } },
        expect.objectContaining({
          toolCallId: expect.stringMatching(/^tool_/),
          messages: []
        })
      );

      // Claudeが2回呼ばれたことを確認（初回＋ツール結果後）
      expect(mockQuery).toHaveBeenCalledTimes(2);

      // 2回目の呼び出しでツール結果が渡されていることを確認
      const secondCall = mockQuery.mock.calls[1][0];
      expect(secondCall.prompt).toContain('Tool execution completed:');
      expect(secondCall.prompt).toContain('Tool: calculator');
      expect(secondCall.prompt).toContain('"result": 42');

      // 最終結果にツール実行結果が反映されていることを確認
      expect(result.text).toContain('42');
    });

    it('should handle multiple tool calls in sequence', async () => {
      const mockWeatherExecute = vi.fn().mockResolvedValue({ temperature: 22, conditions: 'Sunny' });
      const mockTimeExecute = vi.fn().mockResolvedValue({ time: '2024-01-15 10:30:00' });

      const weather = createTool({
        id: 'weather',
        description: 'Get weather information',
        inputSchema: z.object({
          city: z.string()
        }),
        execute: mockWeatherExecute
      });
      const currentTime = createTool({
        id: 'currentTime',
        description: 'Get current time',
        execute: mockTimeExecute
      });
      const tools = {
        weather,
        currentTime
      };

      const agent = new ClaudeCodeAgent({
        name: 'multi-tool-agent',
        instructions: 'You are a helpful assistant',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      let callCount = 0;
      mockQuery.mockImplementation(async function* (args: any) {
        if (callCount === 0) {
          // 最初の呼び出し: 時間ツールを使用
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: `Let me check the current time first.

\`\`\`json
{
  "tool": "currentTime",
  "parameters": {}
}
\`\`\``
            },
            content: `Let me check the current time first.

\`\`\`json
{
  "tool": "currentTime",
  "parameters": {}
}
\`\`\``,
            session_id: 'test-session'
          };
        } else if (callCount === 1) {
          // 2回目の呼び出し: 天気ツールを使用
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: `Now let me check the weather in Tokyo.

\`\`\`json
{
  "tool": "weather",
  "parameters": {
    "city": "Tokyo"
  }
}
\`\`\``
            },
            content: `Now let me check the weather in Tokyo.

\`\`\`json
{
  "tool": "weather",
  "parameters": {
    "city": "Tokyo"
  }
}
\`\`\``,
            session_id: 'test-session'
          };
        } else {
          // 3回目の呼び出し: 最終応答
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: 'The current time is 10:30 AM and the weather in Tokyo is sunny with a temperature of 22°C.'
            },
            content: 'The current time is 10:30 AM and the weather in Tokyo is sunny with a temperature of 22°C.',
            session_id: 'test-session'
          };
        }
        
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const result = await agent.generate('What time is it and what is the weather in Tokyo?');

      // 両方のツールが実行されたことを確認
      expect(mockTimeExecute).toHaveBeenCalledOnce();
      expect(mockWeatherExecute).toHaveBeenCalledWith(
        { context: { city: 'Tokyo' } },
        expect.any(Object)
      );

      // Claudeが3回呼ばれたことを確認
      expect(mockQuery).toHaveBeenCalledTimes(3);

      // 最終結果に両方のツール結果が反映されていることを確認
      expect(result.text).toContain('10:30 AM');
      expect(result.text).toContain('Tokyo');
      expect(result.text).toContain('sunny');
      expect(result.text).toContain('22°C');
    });

    it('should handle tool execution errors gracefully', async () => {
      const mockExecute = vi.fn().mockRejectedValue(new Error('API connection failed'));

      const apiCall = createTool({
        id: 'apiCall',
        description: 'Make API call',
        inputSchema: z.object({
          endpoint: z.string()
        }),
        execute: mockExecute
      });
      const tools = {
        apiCall
      };

      const agent = new ClaudeCodeAgent({
        name: 'error-agent',
        instructions: 'You are an API assistant',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      let callCount = 0;
      mockQuery.mockImplementation(async function* (args: any) {
        if (callCount === 0) {
          // 最初の呼び出し: ツール使用を指示
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: `\`\`\`json
{
  "tool": "apiCall",
  "parameters": {
    "endpoint": "/users"
  }
}
\`\`\``
            },
            content: `\`\`\`json
{
  "tool": "apiCall",
  "parameters": {
    "endpoint": "/users"
  }
}
\`\`\``,
            session_id: 'test-session'
          };
        } else {
          // 2回目の呼び出し: エラー後の応答
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: 'I apologize, but I encountered an error while making the API call. The connection failed. Please check your network settings and try again.'
            },
            content: 'I apologize, but I encountered an error while making the API call. The connection failed. Please check your network settings and try again.',
            session_id: 'test-session'
          };
        }
        
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const result = await agent.generate('Get user data from the API');

      // ツールが実行を試みたことを確認
      expect(mockExecute).toHaveBeenCalledWith(
        { context: { endpoint: '/users' } },
        expect.any(Object)
      );

      // エラー情報が次のプロンプトに含まれることを確認
      const secondCall = mockQuery.mock.calls[1][0];
      expect(secondCall.prompt).toContain('Tool execution failed:');
      expect(secondCall.prompt).toContain('Tool: apiCall');
      expect(secondCall.prompt).toContain('Error: API connection failed');

      // 最終結果がエラーを適切に処理していることを確認
      expect(result.text).toContain('error');
      expect(result.text).toContain('connection failed');
    });

    it('should respect iteration limit to prevent infinite loops', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ data: 'result' });

      const infiniteTool = createTool({
        id: 'infiniteTool',
        description: 'A tool that always needs to be called again',
        execute: mockExecute
      });
      const tools = {
        infiniteTool
      };

      const agent = new ClaudeCodeAgent({
        name: 'loop-agent',
        instructions: 'You are a looping assistant',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      // 常にツール呼び出しを返すモック
      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: `\`\`\`json
{
  "tool": "infiniteTool",
  "parameters": {}
}
\`\`\``
          },
          content: `\`\`\`json
{
  "tool": "infiniteTool",
  "parameters": {}
}
\`\`\``,
          session_id: 'test-session'
        };
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      await agent.generate('Start the infinite loop');

      // ツールが最大5回まで実行されることを確認（maxIterations = 5）
      expect(mockExecute).toHaveBeenCalledTimes(5);
      expect(mockQuery).toHaveBeenCalledTimes(5); // 各イテレーションで1回呼ばれる
    });
  });

  describe('Streaming with tool execution', () => {
    it('should handle tool calls during streaming', async () => {
      const mockExecute2 = vi.fn().mockResolvedValue({ result: 100 });
      const calculator = createTool({
        id: 'calculator',
        description: 'Calculate math expressions',
        inputSchema: z.object({
          expression: z.string()
        }),
        execute: mockExecute2
      });
      const tools = {
        calculator
      };

      const agent = new ClaudeCodeAgent({
        name: 'stream-calc-agent',
        instructions: 'You are a calculator assistant',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      let callCount = 0;
      mockQuery.mockImplementation(async function* (args: any) {
        if (callCount === 0) {
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: 'I will calculate that.\n\n\`\`\`json\n{\n  "tool": "calculator",\n  "parameters": {\n    "expression": "50 + 50"\n  }\n}\n\`\`\`'
            },
            content: 'I will calculate that.\n\n\`\`\`json\n{\n  "tool": "calculator",\n  "parameters": {\n    "expression": "50 + 50"\n  }\n}\n\`\`\`',
            session_id: 'test-session'
          };
        } else {
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: 'The result of 50 + 50 is 100.'
            },
            content: 'The result of 50 + 50 is 100.',
            session_id: 'test-session'
          };
        }
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const streamResult = await agent.stream('Calculate 50 + 50');
      const chunks: any[] = [];
      
      for await (const chunk of streamResult.textStream) {
        chunks.push(chunk);
      }

      // ツールが実行されたことを確認
      expect(mockExecute2).toHaveBeenCalledWith(
        { context: { expression: '50 + 50' } },
        expect.any(Object)
      );

      // ストリーム結果を確認
      const text = await streamResult.text;
      expect(text).toContain('100');
    });
  });
});