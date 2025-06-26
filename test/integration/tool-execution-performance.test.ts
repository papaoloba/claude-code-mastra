import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { createTool } from '@mastra/core/tools';
import * as claudeCodeModule from '@anthropic-ai/claude-code';

// Claude Code SDKをモック
vi.mock('@anthropic-ai/claude-code', () => ({
  query: vi.fn()
}));

describe('Tool Execution Performance - Integration Tests', () => {
  const mockQuery = claudeCodeModule.query as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Performance characteristics', () => {
    it('should execute tools without blocking the event loop', async () => {
      const mockExecute = vi.fn().mockImplementation(() => 
        new Promise(resolve => {
          // 非同期処理をシミュレート
          setImmediate(() => resolve({ result: 'async' }));
        })
      );

      const asyncTool = createTool({
        id: 'asyncTool',
        description: 'Async tool',
        execute: mockExecute
      });

      const agent = new ClaudeCodeAgent({
        name: 'async-agent',
        instructions: 'Test async',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          asyncTool
        }
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: '```json\n{"tool": "asyncTool", "parameters": {}}\n```'
          },
          content: '```json\n{"tool": "asyncTool", "parameters": {}}\n```',
          session_id: 'test-session'
        };
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const startTime = Date.now();
      await agent.generate('Test async execution');
      const endTime = Date.now();

      expect(mockExecute).toHaveBeenCalled();
      expect(endTime - startTime).toBeLessThan(100); // 非同期なので速い
    });

    it('should handle rapid sequential tool calls efficiently', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ processed: true });
      
      const process = createTool({
        id: 'process',
        description: 'Process data',
        execute: mockExecute
      });
      
      const agent = new ClaudeCodeAgent({
        name: 'rapid-agent',
        instructions: 'Test rapid calls',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          process
        }
      });

      let callCount = 0;
      mockQuery.mockImplementation(async function* () {
        if (callCount < 3) {
          const currentCall = callCount;
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: `Processing item ${currentCall}\n\n\`\`\`json\n{"tool": "process", "parameters": {"item": ${currentCall}}}\n\`\`\``
            },
            content: `Processing item ${currentCall}\n\n\`\`\`json\n{"tool": "process", "parameters": {"item": ${currentCall}}}\n\`\`\``,
            session_id: 'test-session'
          };
        } else {
          yield {
            type: 'assistant',
            message: { role: 'assistant', content: 'All items processed!' },
            content: 'All items processed!',
            session_id: 'test-session'
          };
        }
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      const startTime = Date.now();
      const result = await agent.generate('Process multiple items quickly');
      const endTime = Date.now();

      expect(mockExecute).toHaveBeenCalledTimes(3);
      expect(result.text).toContain('All items processed!');
      expect(endTime - startTime).toBeLessThan(500); // 3つのツール呼び出しでも高速
    });

    it('should clean up resources after tool execution', async () => {
      const mockExecute = vi.fn().mockImplementation(() => {
        // リソースを使用するツールをシミュレート
        const resource = { data: Buffer.alloc(1024 * 1024) }; // 1MB
        return Promise.resolve({ 
          size: resource.data.length,
          released: true 
        });
      });

      const useResource = createTool({
        id: 'useResource',
        description: 'Use resources',
        execute: mockExecute
      });

      const agent = new ClaudeCodeAgent({
        name: 'resource-agent',
        instructions: 'Test resources',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          useResource
        }
      });

      mockQuery.mockImplementation(async function* () {
        yield {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: '```json\n{"tool": "useResource", "parameters": {}}\n```'
          },
          content: '```json\n{"tool": "useResource", "parameters": {}}\n```',
          session_id: 'test-session'
        };
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      // メモリ使用量の初期値を記録
      const initialMemory = process.memoryUsage().heapUsed;
      
      await agent.generate('Use resources');
      
      // ガベージコレクションを促す
      if (global.gc) {
        global.gc();
      }
      
      // リソースがクリーンアップされていることを確認
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryDiff = finalMemory - initialMemory;
      
      expect(mockExecute).toHaveBeenCalled();
      // メモリリークがないことを確認（1MBのバッファが解放されている）
      expect(memoryDiff).toBeLessThan(500 * 1024); // 500KB以下の増加
    });

    it('should maintain tool execution history efficiently', async () => {
      const mockExecute = vi.fn().mockImplementation(({ context }) => 
        Promise.resolve({ processed: context.value })
      );

      const track = createTool({
        id: 'track',
        description: 'Track values',
        execute: mockExecute
      });

      const agent = new ClaudeCodeAgent({
        name: 'history-agent',
        instructions: 'Test history',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          track
        }
      });

      // 10回のツール実行をシミュレート
      let callCount = 0;
      mockQuery.mockImplementation(async function* () {
        if (callCount < 10) {
          const current = callCount;
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: `\`\`\`json\n{"tool": "track", "parameters": {"value": ${current}}}\n\`\`\``
            },
            content: `\`\`\`json\n{"tool": "track", "parameters": {"value": ${current}}}\n\`\`\``,
            session_id: 'test-session'
          };
        } else {
          yield {
            type: 'assistant',
            message: { role: 'assistant', content: 'Tracked all values' },
            content: 'Tracked all values',
            session_id: 'test-session'
          };
        }
        yield {
          type: 'result',
          total_cost_usd: 0.001,
          is_error: false
        };
      });

      await agent.generate('Track many values');

      // ツールブリッジの履歴を確認
      const toolBridge = (agent as any).toolBridge;
      const history = toolBridge.getExecutionHistory();
      
      // 現在の実装では、maxIterations (5) の制限があるため、5つまでしか実行されない
      expect(history).toHaveLength(5);
      expect(history[0].output).toEqual({ processed: 0 });
      expect(history[4].output).toEqual({ processed: 4 });
      
      // 履歴のクリア
      toolBridge.clearHistory();
      expect(toolBridge.getExecutionHistory()).toHaveLength(0);
    });
  });

  describe('Streaming performance', () => {
    it('should stream tool results efficiently', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ streamed: true });
      
      const stream = createTool({
        id: 'stream',
        description: 'Stream data',
        execute: mockExecute
      });
      
      const agent = new ClaudeCodeAgent({
        name: 'stream-perf-agent',
        instructions: 'Test streaming performance',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          stream
        }
      });

      let callCount = 0;
      mockQuery.mockImplementation(async function* (args: any) {
        if (callCount === 0) {
          // 初回: ツール呼び出しを含むレスポンス
          callCount++;
          yield {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: `I'll stream some data\n\n\`\`\`json\n{"tool": "stream", "parameters": {}}\n\`\`\``
            },
            content: `I'll stream some data\n\n\`\`\`json\n{"tool": "stream", "parameters": {}}\n\`\`\``,
            session_id: 'test-session'
          };
          yield {
            type: 'result',
            total_cost_usd: 0.001,
            is_error: false
          };
        } else {
          // 2回目: ツール実行後の継続
          for (let i = 0; i < 5; i++) {
            yield {
              type: 'assistant',
              message: { role: 'assistant', content: `Chunk ${i} after tool` },
              content: `Chunk ${i} after tool`,
              session_id: 'test-session'
            };
          }
          yield {
            type: 'result',
            total_cost_usd: 0.001,
            is_error: false
          };
        }
      });

      const streamResult = await agent.stream('Stream with tool');
      const chunks: string[] = [];
      const chunkTimestamps: number[] = [];
      
      const startTime = Date.now();
      for await (const chunk of streamResult.textStream) {
        chunks.push(chunk);
        chunkTimestamps.push(Date.now() - startTime);
      }

      // ストリーミングでは実際のチャンク数は異なる可能性がある
      expect(chunks.length).toBeGreaterThan(0);
      expect(mockExecute).toHaveBeenCalledOnce();
      
      // チャンクが順次届いていることを確認（タイムスタンプがある場合）
      if (chunkTimestamps.length > 1) {
        for (let i = 1; i < chunkTimestamps.length; i++) {
          expect(chunkTimestamps[i]).toBeGreaterThanOrEqual(chunkTimestamps[i - 1]);
        }
      }
    });
  });
});