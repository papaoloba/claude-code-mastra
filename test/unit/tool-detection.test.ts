import { describe, it, expect, vi } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { z } from 'zod';
import type { ToolAction } from '@mastra/core';
import type { SDKMessage } from '@anthropic-ai/claude-code';

describe('Tool Detection and Execution', () => {
  const createMockAgent = (tools: Record<string, ToolAction> = {}) => {
    const agent = new ClaudeCodeAgent({
      name: 'test-agent',
      instructions: 'Test instructions',
      model: 'claude-3-5-sonnet-20241022',
      tools,
      claudeCodeOptions: {
        maxTurns: 1
      }
    });
    
    return agent;
  };

  describe('detectToolCall', () => {
    it('should detect XML format tool calls', () => {
      const agent = createMockAgent({
        calculator: {
          description: 'Calculate math expressions',
          inputSchema: z.object({
            expression: z.string()
          }),
          execute: vi.fn()
        }
      });

      const messages: SDKMessage[] = [{
        type: 'assistant',
        content: `I'll help you calculate that.

<tool_use>
<tool_name>calculator</tool_name>
<parameters>
{
  "expression": "2 + 2"
}
</parameters>
</tool_use>

Let me process this calculation.`
      }];

      // @ts-ignore - accessing private method for testing
      const toolCall = agent.detectToolCall(messages);
      
      expect(toolCall).toBeDefined();
      expect(toolCall?.toolName).toBe('calculator');
      expect(toolCall?.input).toEqual({ expression: '2 + 2' });
    });

    it('should detect natural language tool calls', () => {
      const agent = createMockAgent({
        weather: {
          description: 'Get weather information',
          inputSchema: z.object({
            city: z.string(),
            unit: z.string().optional()
          }),
          execute: vi.fn()
        }
      });

      const messages: SDKMessage[] = [{
        type: 'assistant',
        content: 'I want to use the weather tool with {"city": "Tokyo", "unit": "celsius"}'
      }];

      // @ts-ignore - accessing private method for testing
      const toolCall = agent.detectToolCall(messages);
      
      expect(toolCall).toBeDefined();
      expect(toolCall?.toolName).toBe('weather');
      expect(toolCall?.input).toEqual({ city: 'Tokyo', unit: 'celsius' });
    });

    it('should return null when no tool call is detected', () => {
      const agent = createMockAgent();

      const messages: SDKMessage[] = [{
        type: 'assistant',
        content: 'This is just a regular response without any tool calls.'
      }];

      // @ts-ignore - accessing private method for testing
      const toolCall = agent.detectToolCall(messages);
      
      expect(toolCall).toBeNull();
    });

    it('should handle malformed JSON parameters', () => {
      const agent = createMockAgent({
        test: {
          description: 'Test tool',
          execute: vi.fn()
        }
      });

      const messages: SDKMessage[] = [{
        type: 'assistant',
        content: `<tool_use>
<tool_name>test</tool_name>
<parameters>
invalid json
</parameters>
</tool_use>`
      }];

      // @ts-ignore - accessing private method for testing
      const toolCall = agent.detectToolCall(messages);
      
      expect(toolCall).toBeDefined();
      expect(toolCall?.toolName).toBe('test');
      expect(toolCall?.input).toEqual({});
    });
  });

  describe('generateToolsPrompt', () => {
    it('should generate correct tool prompt with parameters', () => {
      const agent = createMockAgent({
        database: {
          description: 'Query database',
          inputSchema: z.object({
            query: z.string(),
            limit: z.number().optional()
          }),
          execute: vi.fn()
        },
        calculator: {
          description: 'Calculate expressions',
          execute: vi.fn()
        }
      });

      // @ts-ignore - accessing private method for testing
      const prompt = agent.generateToolsPrompt();
      
      expect(prompt).toContain('You have access to the following custom tools:');
      expect(prompt).toContain('database: Query database [Parameters: query: string, limit: optional (optional)]');
      expect(prompt).toContain('calculator: Calculate expressions');
      expect(prompt).toContain('<tool_use>');
      expect(prompt).toContain('<tool_name>TOOL_NAME</tool_name>');
    });

    it('should return empty string when no tools', () => {
      const agent = createMockAgent();

      // @ts-ignore - accessing private method for testing
      const prompt = agent.generateToolsPrompt();
      
      expect(prompt).toBe('');
    });
  });
});