import { describe, it, expect, vi } from 'vitest';
import { ToolBridge } from '../../src/tool-bridge.js';
import { z } from 'zod';
import type { ToolAction } from '@mastra/core';

describe('ToolBridge', () => {
  const createMockTool = (description: string, execute?: any): ToolAction => ({
    description,
    execute: execute || vi.fn().mockResolvedValue({ result: 'success' })
  });

  describe('generateSystemPrompt', () => {
    it('should generate system prompt with tools', () => {
      const tools = {
        calculator: createMockTool('Perform calculations'),
        weather: {
          description: 'Get weather information',
          inputSchema: z.object({
            city: z.string(),
            unit: z.enum(['celsius', 'fahrenheit']).optional()
          }),
          execute: vi.fn()
        } as ToolAction
      };

      const bridge = new ToolBridge(tools);
      const prompt = bridge.generateSystemPrompt();

      expect(prompt).toContain('## Available Tools');
      expect(prompt).toContain('calculator: Perform calculations');
      expect(prompt).toContain('weather: Get weather information [Parameters: city: string, unit: optional (optional)]');
      expect(prompt).toContain('```json');
      expect(prompt).toContain('"tool": "tool_name"');
    });

    it('should return empty string when no tools', () => {
      const bridge = new ToolBridge({});
      expect(bridge.generateSystemPrompt()).toBe('');
    });
  });

  describe('detectToolCall', () => {
    it('should detect JSON code block tool calls', () => {
      const bridge = new ToolBridge({});
      const message = `I'll help you with that calculation.

\`\`\`json
{
  "tool": "calculator",
  "parameters": {
    "expression": "10 + 20"
  }
}
\`\`\`

Let me calculate that for you.`;

      const result = bridge.detectToolCall(message);
      expect(result).toEqual({
        toolName: 'calculator',
        parameters: { expression: '10 + 20' }
      });
    });

    it('should detect inline JSON tool calls', () => {
      const bridge = new ToolBridge({});
      const message = 'I will use {"tool": "weather", "parameters": {"city": "Tokyo"}} to check the weather.';

      const result = bridge.detectToolCall(message);
      expect(result).toEqual({
        toolName: 'weather',
        parameters: { city: 'Tokyo' }
      });
    });

    it('should return null when no tool call detected', () => {
      const bridge = new ToolBridge({});
      const message = 'This is just a regular message without any tool calls.';

      expect(bridge.detectToolCall(message)).toBeNull();
    });

    it('should handle malformed JSON gracefully', () => {
      const bridge = new ToolBridge({});
      const message = '```json\n{invalid json}\n```';

      expect(bridge.detectToolCall(message)).toBeNull();
    });
  });

  describe('executeTool', () => {
    it('should execute tool successfully', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ result: 42 });
      const tools = {
        calculator: {
          description: 'Calculate',
          execute: mockExecute
        } as ToolAction
      };

      const bridge = new ToolBridge(tools);
      const result = await bridge.executeTool('calculator', { expression: '6 * 7' });

      expect(mockExecute).toHaveBeenCalledWith(
        { context: { expression: '6 * 7' } },
        expect.objectContaining({
          toolCallId: expect.stringMatching(/^tool_/),
          messages: []
        })
      );
      expect(result.output).toEqual({ result: 42 });
      expect(result.error).toBeUndefined();
    });

    it('should validate input schema', async () => {
      const tools = {
        weather: {
          description: 'Get weather',
          inputSchema: z.object({
            city: z.string(),
            unit: z.enum(['celsius', 'fahrenheit'])
          }),
          execute: vi.fn().mockResolvedValue({ temp: 22 })
        } as ToolAction
      };

      const bridge = new ToolBridge(tools);
      
      // Invalid input
      const result = await bridge.executeTool('weather', { city: 'Tokyo', unit: 'kelvin' });
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Expected');
    });

    it('should handle tool not found', async () => {
      const bridge = new ToolBridge({});
      const result = await bridge.executeTool('nonexistent', {});

      expect(result.error).toBe('Tool "nonexistent" not found');
      expect(result.output).toBeNull();
    });

    it('should handle execution errors', async () => {
      const tools = {
        failing: {
          description: 'Failing tool',
          execute: vi.fn().mockRejectedValue(new Error('API error'))
        } as ToolAction
      };

      const bridge = new ToolBridge(tools);
      const result = await bridge.executeTool('failing', {});

      expect(result.error).toBe('API error');
      expect(result.output).toBeNull();
    });
  });

  describe('formatToolResult', () => {
    it('should format successful result', () => {
      const bridge = new ToolBridge({});
      const result = {
        toolName: 'calculator',
        input: { expression: '10 + 5' },
        output: { result: 15 },
        timestamp: Date.now()
      };

      const formatted = bridge.formatToolResult(result);
      expect(formatted).toContain('Tool execution completed:');
      expect(formatted).toContain('Tool: calculator');
      expect(formatted).toContain('"result": 15');
    });

    it('should format error result', () => {
      const bridge = new ToolBridge({});
      const result = {
        toolName: 'weather',
        input: { city: 'InvalidCity' },
        output: null,
        error: 'City not found',
        timestamp: Date.now()
      };

      const formatted = bridge.formatToolResult(result);
      expect(formatted).toContain('Tool execution failed:');
      expect(formatted).toContain('Tool: weather');
      expect(formatted).toContain('Error: City not found');
    });
  });

  describe('executionHistory', () => {
    it('should track execution history', async () => {
      const tools = {
        test: createMockTool('Test tool')
      };

      const bridge = new ToolBridge(tools);
      
      await bridge.executeTool('test', { param: 1 });
      await bridge.executeTool('test', { param: 2 });
      
      const history = bridge.getExecutionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].input).toEqual({ param: 1 });
      expect(history[1].input).toEqual({ param: 2 });
    });

    it('should clear history', async () => {
      const tools = {
        test: createMockTool('Test tool')
      };

      const bridge = new ToolBridge(tools);
      
      await bridge.executeTool('test', {});
      expect(bridge.getExecutionHistory()).toHaveLength(1);
      
      bridge.clearHistory();
      expect(bridge.getExecutionHistory()).toHaveLength(0);
    });
  });
});