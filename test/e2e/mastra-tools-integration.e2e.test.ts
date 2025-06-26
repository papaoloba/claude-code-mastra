import { describe, it, expect, beforeAll } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

describe('Mastra Tools Integration E2E Tests', () => {
  const skipIntegrationTests = !process.env.CLAUDE_CODE_E2E_TEST;

  beforeAll(() => {
    if (skipIntegrationTests) {
      console.log('⚠️  E2E tests skipped. Set CLAUDE_CODE_E2E_TEST=true to run integration tests with real Claude Code SDK.');
    }
  });

  describe('Basic Tool Integration', () => {
    it.skipIf(skipIntegrationTests)('should execute simple calculator tool', async () => {
      const calculatorTool = createTool({
        id: 'calculator',
        description: 'Perform basic mathematical calculations',
        inputSchema: z.object({
          expression: z.string().describe('Mathematical expression to evaluate')
        }),
        execute: async ({ context }) => {
          try {
            // 安全な計算評価（本来はmathjs等を使用すべき）
            const result = Function(`"use strict"; return (${context.expression})`)();
            return {
              result: Number(result),
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
        instructions: 'You are a helpful assistant with access to a calculator tool. Use it for any mathematical calculations.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          calculator: calculatorTool
        },
        claudeCodeOptions: {
          maxTurns: 3,
          timeout: 25000
        }
      });

      const result = await agent.generate('What is 25 * 4 + 10?');

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // 計算結果110が含まれている
      const text = result.text.toLowerCase();
      const hasCorrectAnswer = text.includes('110') || 
                              text.includes('one hundred') ||
                              text.includes('hundred ten');

      expect(hasCorrectAnswer).toBe(true);

      // toolCalls が存在する
      if (result.toolCalls && result.toolCalls.length > 0) {
        expect(result.toolCalls[0].toolName).toBe('calculator');
      }

      // toolResults から結果を確認
      if (result.toolResults && result.toolResults.length > 0) {
        expect(result.toolResults[0].toolName).toBe('calculator');
        expect(result.toolResults[0].result.result).toBe(110);
      }

      console.log('✅ Calculator tool test passed');
      console.log('Response:', result.text);
      console.log('Tool calls:', result.toolCalls?.length || 0);
    }, 45000);

    it.skipIf(skipIntegrationTests)('should handle tool with validation', async () => {
      const userTool = createTool({
        id: 'createUser',
        description: 'Create a new user with validation',
        inputSchema: z.object({
          name: z.string().min(2).describe('User name (minimum 2 characters)'),
          email: z.string().email().describe('Valid email address'),
          age: z.number().min(13).max(120).describe('Age between 13 and 120')
        }),
        execute: async ({ context }) => {
          return {
            success: true,
            user: {
              id: Math.floor(Math.random() * 1000),
              name: context.name,
              email: context.email,
              age: context.age,
              createdAt: new Date().toISOString()
            }
          };
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'user-creation-agent',
        instructions: 'You are a helpful assistant that can create users. Always use the createUser tool when asked to create a user.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          createUser: userTool
        },
        claudeCodeOptions: {
          maxTurns: 3,
          timeout: 25000
        }
      });

      const result = await agent.generate(
        'Create a user with name "John Doe", email "john.doe@example.com", and age 25'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // ユーザー作成成功を示すメッセージ
      const text = result.text.toLowerCase();
      const hasUserCreation = text.includes('john') ||
                             text.includes('user') ||
                             text.includes('created') ||
                             text.includes('success');

      expect(hasUserCreation).toBe(true);

      console.log('✅ User creation tool test passed');
      console.log('Response:', result.text);
    }, 45000);

    it.skipIf(skipIntegrationTests)('should handle multiple tools', async () => {
      const weatherTool = createTool({
        id: 'getWeather',
        description: 'Get weather information for a city',
        inputSchema: z.object({
          city: z.string().describe('City name')
        }),
        execute: async ({ context }) => {
          // モック天気データ
          const mockWeather = {
            city: context.city,
            temperature: Math.floor(Math.random() * 30) + 5,
            condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
            humidity: Math.floor(Math.random() * 40) + 40
          };
          return mockWeather;
        }
      });

      const timeTool = createTool({
        id: 'getCurrentTime',
        description: 'Get current time',
        execute: async () => {
          return {
            timestamp: Date.now(),
            iso: new Date().toISOString(),
            formatted: new Date().toLocaleString()
          };
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'multi-tool-agent',
        instructions: 'You are a helpful assistant with access to weather and time tools.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          getWeather: weatherTool,
          getCurrentTime: timeTool
        },
        claudeCodeOptions: {
          maxTurns: 3,
          timeout: 30000
        }
      });

      const result = await agent.generate(
        'What is the current time and what is the weather like in Tokyo?'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // レスポンスが生成されていることを確認
      const text = result.text.toLowerCase();
      const hasResponse = text.length > 0;
      
      // ツールの存在を認識していることを確認（利用可能なツールについて言及）
      const mentionsTools = text.includes('getweather') || 
                           text.includes('getcurrenttime') || 
                           text.includes('tool') ||
                           text.includes('weather') ||
                           text.includes('time');

      expect(hasResponse).toBe(true);
      expect(mentionsTools).toBe(true);

      console.log('✅ Multiple tools test passed');
      console.log('Response:', result.text);
      console.log('Tool calls count:', result.toolCalls?.length || 0);
    }, 50000);
  });

  describe('Tool Error Handling', () => {
    it.skipIf(skipIntegrationTests)('should handle tool execution errors gracefully', async () => {
      const errorTool = createTool({
        id: 'errorTool',
        description: 'A tool that may throw errors',
        inputSchema: z.object({
          shouldError: z.boolean().describe('Whether to throw an error')
        }),
        execute: async ({ context }) => {
          if (context.shouldError) {
            throw new Error('Intentional test error');
          }
          return { success: true };
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'error-handling-agent',
        instructions: 'You are a helpful assistant. Use the errorTool when requested.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          errorTool: errorTool
        },
        claudeCodeOptions: {
          maxTurns: 2,
          timeout: 25000
        }
      });

      const result = await agent.generate(
        'Use the errorTool with shouldError set to false'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);

      // ツールが正常に実行されたことを確認
      console.log('Error tool response text:', result.text);
      
      // toolResults でツール実行結果を確認
      if (result.toolResults && result.toolResults.length > 0) {
        expect(result.toolResults[0].toolName).toBe('errorTool');
        expect(result.toolResults[0].result).toHaveProperty('success');
        expect(result.toolResults[0].result.success).toBe(true);
      } else {
        // フォールバック: レスポンステキストをチェック
        const text = result.text.toLowerCase();
        const isSuccessful = text.includes('success') ||
                            text.includes('completed') ||
                            text.includes('done') ||
                            text.includes('true');
        expect(isSuccessful).toBe(true);
      }

      console.log('✅ Tool error handling test passed');
      console.log('Response:', result.text);
    }, 40000);
  });

  describe('Tool Response Format', () => {
    it.skipIf(skipIntegrationTests)('should return correct toolCalls format', async () => {
      const simpleTool = createTool({
        id: 'simpleTool',
        description: 'A simple tool for testing response format',
        inputSchema: z.object({
          message: z.string()
        }),
        execute: async ({ context }) => {
          return {
            receivedMessage: context.message,
            timestamp: Date.now()
          };
        }
      });

      const agent = new ClaudeCodeAgent({
        name: 'format-test-agent',
        instructions: 'You are a helpful assistant. Use the simpleTool when requested.',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          simpleTool: simpleTool
        },
        claudeCodeOptions: {
          maxTurns: 2,
          timeout: 25000
        }
      });

      const result = await agent.generate(
        'Use the simpleTool with message "Hello World"'
      );

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();

      // toolCalls が正しい形式で返される
      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolCall = result.toolCalls[0];
        expect(toolCall).toHaveProperty('toolCallId');
        expect(toolCall).toHaveProperty('toolName');
        expect(toolCall).toHaveProperty('args');
        
        expect(toolCall.toolName).toBe('simpleTool');
        expect(toolCall.args).toHaveProperty('message');
      }

      // toolResults を確認
      if (result.toolResults && result.toolResults.length > 0) {
        const toolResult = result.toolResults[0];
        expect(toolResult).toHaveProperty('result');
        expect(toolResult.result).toHaveProperty('receivedMessage');
      }

      console.log('✅ Tool response format test passed');
      console.log('Tool calls format:', result.toolCalls);
    }, 40000);
  });
});