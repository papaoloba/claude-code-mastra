import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { z } from 'zod';
import type { SDKMessage } from '@anthropic-ai/claude-code';
import type { ToolAction } from '@mastra/core';

// Claude Code SDKをモック
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

describe('ClaudeCodeAgent - Mastra Agent Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Definition', () => {
    it('should accept tools in the constructor', () => {
      const mockTool: ToolAction<any, any> = {
        description: 'A test tool',
        inputSchema: z.object({
          message: z.string()
        }),
        execute: async ({ context }) => {
          return { result: `Processed: ${context.message}` };
        }
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          testTool: mockTool
        }
      });

      expect(agent).toBeDefined();
      expect(agent.getTools()).toHaveProperty('testTool');
      expect(agent.getTools().testTool).toBe(mockTool);
    });

    it('should accept multiple tools', () => {
      const tool1: ToolAction = {
        description: 'Tool 1',
        execute: async () => ({ result: 'Tool 1 result' })
      };

      const tool2: ToolAction = {
        description: 'Tool 2',
        inputSchema: z.object({ input: z.string() }),
        execute: async ({ context }) => ({ result: context.input })
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          tool1,
          tool2
        }
      });

      const tools = agent.getTools();
      expect(Object.keys(tools)).toHaveLength(2);
      expect(tools).toHaveProperty('tool1');
      expect(tools).toHaveProperty('tool2');
    });

    it('should work with no tools', () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022'
      });

      const tools = agent.getTools();
      expect(tools).toEqual({});
    });
  });

  describe('Tool Execution', () => {
    it('should execute tools when called', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ result: 'Tool executed' });
      const mockTool: ToolAction = {
        description: 'Execute this tool',
        inputSchema: z.object({
          input: z.string()
        }),
        execute: mockExecute
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          executeTool: mockTool
        }
      });

      // ツールの実行をテスト
      const result = await agent.executeTool('executeTool', { input: 'test input' });
      
      expect(mockExecute).toHaveBeenCalledWith(
        { context: { input: 'test input' } },
        expect.anything()
      );
      expect(result).toEqual({ result: 'Tool executed' });
    });

    it('should validate input schema before execution', async () => {
      const mockTool: ToolAction = {
        description: 'Tool with schema',
        inputSchema: z.object({
          name: z.string(),
          age: z.number().min(0)
        }),
        execute: async ({ context }) => ({ 
          message: `Hello ${context.name}, you are ${context.age} years old` 
        })
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          greetTool: mockTool
        }
      });

      // 無効な入力でエラーになることを確認
      await expect(
        agent.executeTool('greetTool', { name: 'John', age: -5 })
      ).rejects.toThrow();

      // 有効な入力で成功することを確認
      const result = await agent.executeTool('greetTool', { name: 'John', age: 30 });
      expect(result).toEqual({ message: 'Hello John, you are 30 years old' });
    });

    it('should throw error for non-existent tool', async () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {}
      });

      await expect(
        agent.executeTool('nonExistentTool', {})
      ).rejects.toThrow('Tool "nonExistentTool" not found');
    });
  });

  describe('Tool Information', () => {
    it('should provide tool descriptions', () => {
      const tools = {
        weatherTool: {
          description: 'Get weather information for a city',
          inputSchema: z.object({
            city: z.string()
          })
        } as ToolAction,
        calculatorTool: {
          description: 'Perform mathematical calculations',
          inputSchema: z.object({
            expression: z.string()
          })
        } as ToolAction
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      const toolDescriptions = agent.getToolDescriptions();
      expect(toolDescriptions).toEqual({
        weatherTool: 'Get weather information for a city',
        calculatorTool: 'Perform mathematical calculations'
      });
    });

    it('should list available tool names', () => {
      const tools = {
        tool1: { description: 'Tool 1' } as ToolAction,
        tool2: { description: 'Tool 2' } as ToolAction,
        tool3: { description: 'Tool 3' } as ToolAction
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      const toolNames = agent.getToolNames();
      expect(toolNames).toEqual(['tool1', 'tool2', 'tool3']);
    });
  });

  describe('Integration with Claude Code', () => {
    it('should include tool information in agent instructions', async () => {
      const tools = {
        searchTool: {
          description: 'Search for information',
          inputSchema: z.object({
            query: z.string()
          })
        } as ToolAction
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'You are a helpful assistant.',
        model: 'claude-3-5-sonnet-20241022',
        tools,
        claudeCodeOptions: {
          appendSystemPrompt: 'Always use tools when appropriate.'
        }
      });

      const mockMessages: SDKMessage[] = [];
      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      await agent.generate('Search for TypeScript tutorials');

      // appendSystemPromptにツール情報が含まれることを確認
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Search for TypeScript tutorials',
        options: expect.objectContaining({
          appendSystemPrompt: expect.stringContaining('Always use tools when appropriate.')
        })
      });
    });
  });

  describe('Dynamic Tools', () => {
    it('should support adding tools after initialization', () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022'
      });

      expect(agent.getToolNames()).toHaveLength(0);

      const newTool: ToolAction = {
        description: 'New dynamic tool',
        execute: async () => ({ result: 'Dynamic result' })
      };

      agent.addTool('dynamicTool', newTool);
      
      expect(agent.getToolNames()).toContain('dynamicTool');
      expect(agent.getTools().dynamicTool).toBe(newTool);
    });

    it('should support removing tools', () => {
      const tools = {
        tool1: { description: 'Tool 1' } as ToolAction,
        tool2: { description: 'Tool 2' } as ToolAction
      };

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools
      });

      expect(agent.getToolNames()).toHaveLength(2);

      agent.removeTool('tool1');

      expect(agent.getToolNames()).toHaveLength(1);
      expect(agent.getToolNames()).not.toContain('tool1');
      expect(agent.getToolNames()).toContain('tool2');
    });
  });
});