import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { z } from 'zod';
import type { SDKMessage } from '@anthropic-ai/claude-code';
import { createTool } from '@mastra/core/tools';
import * as claudeCodeModule from '@anthropic-ai/claude-code';

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

describe('ClaudeCodeAgent - Mastra Agent Tools', () => {
  const mockQuery = claudeCodeModule.query as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Definition', () => {
    it('should accept tools in the constructor', () => {
      const mockTool = createTool({
        id: 'testTool',
        description: 'A test tool',
        inputSchema: z.object({
          message: z.string()
        }),
        execute: async ({ context }) => {
          return { result: `Processed: ${context.message}` };
        }
      });

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
      const tool1 = createTool({
        id: 'tool1',
        description: 'Tool 1',
        execute: async () => ({ result: 'Tool 1 result' })
      });

      const tool2 = createTool({
        id: 'tool2',
        description: 'Tool 2',
        inputSchema: z.object({ input: z.string() }),
        execute: async ({ context }) => ({ result: context.input })
      });

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
      expect(Object.keys(tools)).toHaveLength(0);
    });
  });

  describe('Tool Execution', () => {
    it('should execute tools when called', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ result: 'success' });
      const testTool = createTool({
        id: 'testTool',
        description: 'Test tool',
        inputSchema: z.object({
          input: z.string()
        }),
        execute: mockExecute
      });

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          testTool
        }
      });

      const result = await agent.executeTool('testTool', { input: 'test data' });

      expect(mockExecute).toHaveBeenCalledWith(
        { context: { input: 'test data' } },
        expect.objectContaining({
          toolCallId: expect.stringMatching(/^tool_/),
          messages: []
        })
      );
      expect(result).toEqual({ result: 'success' });
    });

    it('should validate input schema before execution', async () => {
      const mockExecute = vi.fn();
      const strictTool = createTool({
        id: 'strictTool',
        description: 'Tool with strict input validation',
        inputSchema: z.object({
          name: z.string().min(3),
          age: z.number().positive()
        }),
        execute: mockExecute
      });

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          strictTool
        }
      });

      // 無効な入力でエラーになることを確認
      await expect(
        agent.executeTool('strictTool', { name: 'Jo', age: -5 })
      ).rejects.toThrow();

      expect(mockExecute).not.toHaveBeenCalled();

      // 有効な入力で成功することを確認
      await agent.executeTool('strictTool', { name: 'John', age: 25 });
      expect(mockExecute).toHaveBeenCalled();
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
      const describedTool1 = createTool({
        id: 'describedTool1',
        description: 'This tool does something',
        execute: vi.fn()
      });

      const describedTool2 = createTool({
        id: 'describedTool2',
        description: 'This tool does something else',
        execute: vi.fn()
      });

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          describedTool1,
          describedTool2
        }
      });

      const descriptions = agent.getToolDescriptions();
      expect(descriptions).toEqual({
        describedTool1: 'This tool does something',
        describedTool2: 'This tool does something else'
      });
    });

    it('should list available tool names', () => {
      const alpha = createTool({
        id: 'alpha',
        description: 'Alpha tool',
        execute: vi.fn()
      });

      const beta = createTool({
        id: 'beta',
        description: 'Beta tool',
        execute: vi.fn()
      });

      const gamma = createTool({
        id: 'gamma',
        description: 'Gamma tool',
        execute: vi.fn()
      });

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          alpha,
          beta,
          gamma
        }
      });

      const toolNames = agent.getToolNames();
      expect(toolNames).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('Integration with Claude Code', () => {
    it('should include tool information in agent instructions', async () => {
      const searchTool = createTool({
        id: 'searchTool',
        description: 'Search for information',
        inputSchema: z.object({
          query: z.string()
        }),
        execute: async () => ({
          results: []
        })
      });

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          searchTool
        },
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

      // ツール情報がシステムプロンプトに含まれることを確認
      expect(mockQuery).toHaveBeenCalledWith({
        prompt: 'Search for TypeScript tutorials',
        options: expect.objectContaining({
          appendSystemPrompt: expect.stringContaining('Always use tools when appropriate.')
        })
      });
      
      // システムプロンプトにツール情報が含まれることを確認
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.appendSystemPrompt).toContain('## Available Tools');
      expect(callArgs.options.appendSystemPrompt).toContain('searchTool: Search for information');
    });
  });

  describe('Dynamic Tools', () => {
    it('should support adding tools after initialization', () => {
      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {}
      });

      expect(agent.getToolNames()).toHaveLength(0);

      // 新しいツールを追加
      const dynamicTool = createTool({
        id: 'dynamicTool',
        description: 'Dynamic tool',
        execute: vi.fn().mockResolvedValue({ result: 'dynamic' })
      });
      
      agent.addTool('dynamicTool', dynamicTool);

      expect(agent.getToolNames()).toContain('dynamicTool');
      expect(agent.getTools().dynamicTool).toBe(dynamicTool);

      // 別のツールを追加
      const anotherTool = createTool({
        id: 'anotherTool',
        description: 'Another tool',
        execute: vi.fn()
      });
      
      agent.addTool('anotherTool', anotherTool);

      expect(agent.getToolNames()).toHaveLength(2);
    });

    it('should support removing tools', () => {
      const toolToRemove = createTool({
        id: 'toolToRemove',
        description: 'Tool to be removed',
        execute: vi.fn()
      });

      const toolToKeep = createTool({
        id: 'toolToKeep',
        description: 'Tool to keep',
        execute: vi.fn()
      });

      const agent = new ClaudeCodeAgent({
        name: 'test-agent',
        instructions: 'Test instructions',
        model: 'claude-3-5-sonnet-20241022',
        tools: {
          toolToRemove,
          toolToKeep
        }
      });

      expect(agent.getToolNames()).toHaveLength(2);

      agent.removeTool('toolToRemove');

      expect(agent.getToolNames()).toHaveLength(1);
      expect(agent.getToolNames()).not.toContain('toolToRemove');
      expect(agent.getToolNames()).toContain('toolToKeep');
    });
  });
});