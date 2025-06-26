import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

describe('E2E Tool Execution Tests', () => {
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  describe('Real Tool Execution with Claude Code', () => {
    it.skipIf(skipIntegrationTests)('should execute tool and continue conversation', async () => {
      // 簡単な計算ツール
      const calculatorTool = createTool({
        id: 'calculator',
        description: 'Perform mathematical calculations',
        inputSchema: z.object({
          expression: z.string().describe('Mathematical expression like "2+2" or "10*5"')
        }),
        execute: async ({ context }) => {
          try {
            // 簡単な算術演算のみサポート
            const result = Function('"use strict"; return (' + context.expression + ')')();
            console.log(`🔧 Calculator tool executed: ${context.expression} = ${result}`);
            return { result, expression: context.expression };
          } catch (error) {
            return { error: 'Invalid expression', expression: context.expression };
          }
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'calculator-agent',
        instructions: 'You are a helpful calculator assistant.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          calculator: calculatorTool
        },
        claudeCodeOptions: {
          maxTurns: 3,
          timeout: 60000
        }
      });

      try {
        const result = await agent.generate(
          'What is 15 times 8? Please calculate this for me.'
        );

        console.log('✅ Tool execution E2E test result:');
        console.log('Response:', result.text);
        
        // レスポンスに計算結果（120）が含まれることを確認
        expect(result.text.toLowerCase()).toMatch(/120|one hundred twenty/);
        
        // メタデータが含まれることを確認
        expect(result.experimental_providerMetadata).toBeDefined();
        expect(result.experimental_providerMetadata.sessionId).toBeDefined();
      } catch (error) {
        console.error('❌ Tool execution E2E test failed:', error);
        throw error;
      }
    }, 120000);

    it.skipIf(skipIntegrationTests)('should handle tool with complex parameters', async () => {
      // データベースクエリのシミュレーション
      const databaseTool = createTool({
        id: 'queryDatabase',
        description: 'Query a mock database',
        inputSchema: z.object({
          table: z.string().describe('Table name'),
          filters: z.object({
            field: z.string(),
            operator: z.enum(['=', '>', '<', '>=', '<=', '!=']),
            value: z.union([z.string(), z.number()])
          }).optional(),
          limit: z.number().optional().default(10)
        }),
        execute: async ({ context }) => {
          console.log(`🔧 Database tool executed:`, context);
          
          // モックデータを返す
          const mockData = [
            { id: 1, name: 'Alice', age: 30, department: 'Engineering' },
            { id: 2, name: 'Bob', age: 25, department: 'Marketing' },
            { id: 3, name: 'Charlie', age: 35, department: 'Engineering' }
          ];
          
          let results = [...mockData];
          
          // フィルタリング
          if (context.filters) {
            results = results.filter(row => {
              const fieldValue = row[context.filters.field as keyof typeof row];
              const filterValue = context.filters.value;
              
              switch (context.filters.operator) {
                case '=': return fieldValue === filterValue;
                case '>': return fieldValue > filterValue;
                case '<': return fieldValue < filterValue;
                case '>=': return fieldValue >= filterValue;
                case '<=': return fieldValue <= filterValue;
                case '!=': return fieldValue !== filterValue;
                default: return true;
              }
            });
          }
          
          // リミット適用
          results = results.slice(0, context.limit);
          
          return {
            rows: results,
            count: results.length,
            query: context
          };
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'database-agent',
        instructions: 'You are a database assistant. Help users query data.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          queryDatabase: databaseTool
        },
        claudeCodeOptions: {
          maxTurns: 3,
          timeout: 60000
        }
      });

      try {
        const result = await agent.generate(
          'Find all employees in the Engineering department'
        );

        console.log('✅ Complex tool E2E test result:');
        console.log('Response:', result.text);
        
        // レスポンスにEngineeringメンバーが含まれることを確認
        const lowerText = result.text.toLowerCase();
        expect(lowerText).toMatch(/alice|charlie|engineering/);
        
        // 結果がフィルタリングされていることを確認（Bobは含まれない）
        expect(lowerText.includes('bob') && lowerText.includes('marketing')).toBe(false);
      } catch (error) {
        console.error('❌ Complex tool E2E test failed:', error);
        throw error;
      }
    }, 120000);

    it.skipIf(skipIntegrationTests)('should work with streaming', async () => {
      const timeTool = createTool({
        id: 'getCurrentTime',
        description: 'Get current time and date',
        execute: async () => {
          const now = new Date();
          console.log(`🔧 Time tool executed: ${now.toISOString()}`);
          return {
            iso: now.toISOString(),
            formatted: now.toLocaleString(),
            timestamp: now.getTime()
          };
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'time-agent',
        instructions: 'You are a time assistant.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          getCurrentTime: timeTool
        },
        claudeCodeOptions: {
          maxTurns: 2,
          timeout: 60000
        }
      });

      try {
        const streamResult = await agent.stream('What time is it right now?');
        
        const chunks: string[] = [];
        for await (const chunk of streamResult.textStream) {
          chunks.push(chunk);
        }
        
        const fullText = chunks.join('');
        console.log('✅ Streaming with tools E2E test result:');
        console.log('Full response:', fullText);
        
        // レスポンスに時間情報が含まれることを確認
        expect(fullText).toBeTruthy();
        expect(fullText.length).toBeGreaterThan(10);
        
        // 最終テキストも確認
        const finalText = await streamResult.text;
        expect(finalText).toBe(fullText);
      } catch (error) {
        console.error('❌ Streaming with tools E2E test failed:', error);
        throw error;
      }
    }, 120000);
  });
});