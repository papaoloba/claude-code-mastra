import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

describe('E2E Agent Tools Tests', () => {
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  describe('Tool Integration with Claude Code', () => {
    it.skipIf(skipIntegrationTests)('should use custom tools to enhance responses', async () => {
      // カスタムツールの定義
      const calculatorTool = createTool({
        id: 'calculator',
        description: 'Perform basic mathematical calculations',
        inputSchema: z.object({
          expression: z.string().describe('Mathematical expression to evaluate'),
          precision: z.number().optional().default(2).describe('Decimal precision')
        }),
        execute: async ({ context }) => {
          try {
            // 簡単な計算を実行（実際の実装では eval を避けて適切なパーサーを使用）
            const result = Function('"use strict"; return (' + context.expression + ')')();
            return {
              result: Number(result.toFixed(context.precision)),
              expression: context.expression
            };
          } catch (error) {
            return {
              error: 'Invalid mathematical expression',
              expression: context.expression
            };
          }
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'calculator-agent',
        instructions: 'You are a helpful assistant with access to a calculator tool. Use it when needed for calculations.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          calculator: calculatorTool
        },
        claudeCodeOptions: {
          maxTurns: 1,
          timeout: 30000
        }
      });

      try {
        const result = await agent.generate(
          'What is 15.7 multiplied by 3.2? Please calculate this for me.'
        );

        expect(result.text).toBeTruthy();
        console.log('✅ Calculator tool test result:', result.text);
        
        // 計算結果について言及しているはず
        expect(result.text.toLowerCase()).toMatch(/50\.24|fifty|calculation|multiply/);
      } catch (error) {
        console.error('❌ Calculator tool test failed:', error);
        throw error;
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should handle multiple tools', async () => {
      // 複数のツールを定義
      const getCurrentTime = createTool({
        id: 'getCurrentTime',
        description: 'Get the current date and time',
        execute: async () => {
          const now = new Date();
          return {
            iso: now.toISOString(),
            formatted: now.toLocaleString(),
            timestamp: now.getTime()
          };
        }
      });
      
      const wordCounter = createTool({
        id: 'wordCounter',
        description: 'Count words and characters in a text',
        inputSchema: z.object({
          text: z.string().describe('Text to analyze')
        }),
        execute: async ({ context }) => {
          const words = context.text.split(/\s+/).filter(word => word.length > 0);
          return {
            wordCount: words.length,
            characterCount: context.text.length,
            characterCountNoSpaces: context.text.replace(/\s/g, '').length
          };
        }
      });
      
      const tools = {
        getCurrentTime,
        wordCounter
      };

      const agent = new ClaudeCodeAgent({
        name: 'multi-tool-agent',
        instructions: 'You are a helpful assistant with access to time and text analysis tools.',
        model: 'claude-3-5-sonnet-20241022',
        tools,
        claudeCodeOptions: {
          maxTurns: 2,
          timeout: 30000
        }
      });

      try {
        const result = await agent.generate(
          'Tell me the current time and count the words in this sentence: "The quick brown fox jumps over the lazy dog"'
        );

        expect(result.text).toBeTruthy();
        console.log('✅ Multi-tool test result:', result.text);
        
        // 時間と単語数の両方について言及しているはず
        const lowerText = result.text.toLowerCase();
        expect(
          (lowerText.includes('time') || lowerText.includes('date')) &&
          (lowerText.includes('word') || lowerText.includes('9') || lowerText.includes('nine'))
        ).toBe(true);
      } catch (error) {
        console.error('❌ Multi-tool test failed:', error);
        throw error;
      }
    }, 60000);

    it.skipIf(skipIntegrationTests)('should execute tool directly', async () => {
      const mockApiTool = createTool({
        id: 'mockApi',
        description: 'Mock API call',
        inputSchema: z.object({
          endpoint: z.string(),
          method: z.enum(['GET', 'POST'])
        }),
        execute: async ({ context }) => {
          return {
            status: 200,
            data: {
              message: `Mock response from ${context.method} ${context.endpoint}`,
              timestamp: new Date().toISOString()
            }
          };
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'api-agent',
        instructions: 'You are an API testing assistant.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          mockApi: mockApiTool
        }
      });

      try {
        // ツールを直接実行
        const toolResult = await agent.executeTool('mockApi', {
          endpoint: '/api/users',
          method: 'GET'
        });

        expect(toolResult).toBeDefined();
        expect(toolResult.status).toBe(200);
        expect(toolResult.data.message).toContain('GET /api/users');
        
        console.log('✅ Direct tool execution test passed:', toolResult);
      } catch (error) {
        console.error('❌ Direct tool execution test failed:', error);
        throw error;
      }
    }, 30000);

    it.skipIf(skipIntegrationTests)('should validate tool inputs', async () => {
      const strictTool = createTool({
        id: 'validateUser',
        description: 'Tool with strict input validation',
        inputSchema: z.object({
          name: z.string().min(3).max(50),
          age: z.number().int().min(0).max(150),
          email: z.string().email()
        }),
        execute: async ({ context }) => {
          return { success: true, data: context };
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'validation-agent',
        instructions: 'You are a data validation assistant.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          validateUser: strictTool
        }
      });

      try {
        // 無効な入力でエラーになることを確認
        await expect(
          agent.executeTool('validateUser', {
            name: 'Jo', // 短すぎる
            age: 200,   // 大きすぎる
            email: 'not-an-email'
          })
        ).rejects.toThrow();

        // 有効な入力で成功することを確認
        const validResult = await agent.executeTool('validateUser', {
          name: 'John Doe',
          age: 30,
          email: 'john@example.com'
        });

        expect(validResult.success).toBe(true);
        expect(validResult.data.name).toBe('John Doe');
        
        console.log('✅ Tool validation test passed');
      } catch (error) {
        console.error('❌ Tool validation test failed:', error);
        throw error;
      }
    }, 30000);
  });

  describe('Dynamic Tool Management', () => {
    it.skipIf(skipIntegrationTests)('should add and remove tools dynamically', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'dynamic-agent',
        instructions: 'You are a dynamic assistant.',
        model: 'claude-3-5-sonnet-20241022',
        claudeCodeOptions: {
          maxTurns: 1,
          timeout: 30000
        }
      });

      try {
        // 初期状態：ツールなし
        expect(agent.getToolNames()).toHaveLength(0);

        // ツールを追加
        const echoTool = createTool({
          id: 'echo',
          description: 'Echo back the input',
          inputSchema: z.object({
            message: z.string()
          }),
          execute: async ({ context }) => ({ echo: context.message })
        });

        agent.addTool('echo', echoTool);
        expect(agent.getToolNames()).toContain('echo');

        // ツールを実行
        const result = await agent.executeTool('echo', { message: 'Hello World' });
        expect(result.echo).toBe('Hello World');

        // ツールを削除
        agent.removeTool('echo');
        expect(agent.getToolNames()).not.toContain('echo');

        // 削除後は実行できない
        await expect(
          agent.executeTool('echo', { message: 'Test' })
        ).rejects.toThrow('Tool "echo" not found');

        console.log('✅ Dynamic tool management test passed');
      } catch (error) {
        console.error('❌ Dynamic tool management test failed:', error);
        throw error;
      }
    }, 30000);
  });
});