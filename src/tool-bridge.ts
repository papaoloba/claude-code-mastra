import type { ToolAction } from '@mastra/core';
import type { SDKMessage } from '@anthropic-ai/claude-code';

/**
 * Mastraツールの実行結果を表すインターフェース
 */
export interface ToolExecutionResult {
  toolName: string;
  input: any;
  output: any;
  error?: string;
  timestamp: number;
}

/**
 * Claude CodeとMastraツールの間のブリッジ
 */
export class ToolBridge {
  private tools: Record<string, ToolAction<any, any, any>>;
  private executionHistory: ToolExecutionResult[] = [];

  constructor(tools: Record<string, ToolAction<any, any, any>> = {}) {
    this.tools = tools;
  }

  /**
   * ツール情報を含むシステムプロンプトを生成
   */
  generateSystemPrompt(): string {
    const toolNames = Object.keys(this.tools);
    if (toolNames.length === 0) {
      return '';
    }

    const toolDescriptions = toolNames.map(name => {
      const tool = this.tools[name];
      let description = `- ${name}: ${tool.description}`;
      
      // 入力スキーマの情報を追加
      if (tool.inputSchema) {
        try {
          const shape = (tool.inputSchema as any)._def?.shape?.() || {};
          const params = Object.entries(shape).map(([key, value]: [string, any]) => {
            const type = value._def?.typeName?.replace('Zod', '').toLowerCase() || 'unknown';
            const isOptional = value.isOptional?.() || false;
            return `${key}: ${type}${isOptional ? ' (optional)' : ''}`;
          }).join(', ');
          
          if (params) {
            description += ` [Parameters: ${params}]`;
          }
        } catch (e) {
          // スキーマの解析に失敗した場合は無視
        }
      }
      
      return description;
    }).join('\n');

    return `## Available Tools

You have access to the following tools that you can use to help with your tasks:

${toolDescriptions}

When you need to use a tool, output a JSON code block with the following format:
\`\`\`json
{
  "tool": "tool_name",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  }
}
\`\`\`

After I execute the tool, I will provide you with the result, and you can continue with your response.`;
  }

  /**
   * メッセージからツール呼び出しを検出
   */
  detectToolCall(message: string): { toolName: string; parameters: any } | null {
    // JSON コードブロックを検出
    const jsonBlockMatch = message.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1]);
        if (parsed.tool && typeof parsed.tool === 'string') {
          return {
            toolName: parsed.tool,
            parameters: parsed.parameters || {}
          };
        }
      } catch (e) {
        // JSON パースエラー
      }
    }

    // 代替形式: インラインJSON
    const inlineJsonMatch = message.match(/\{[^}]*"tool":\s*"([^"]+)"[^}]*\}/);
    if (inlineJsonMatch) {
      try {
        // より詳細なパターンでJSONオブジェクトを検出
        const jsonMatch = message.match(/\{[^{}]*"tool"\s*:\s*"[^"]+"\s*(?:,\s*"parameters"\s*:\s*\{[^}]*\})?\s*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tool) {
            return {
              toolName: parsed.tool,
              parameters: parsed.parameters || {}
            };
          }
        }
      } catch (e) {
        // JSON パースエラー
      }
    }

    return null;
  }

  /**
   * ツールを実行
   */
  async executeTool(toolName: string, parameters: any): Promise<ToolExecutionResult> {
    const timestamp = Date.now();
    
    if (!this.tools[toolName]) {
      const error = `Tool "${toolName}" not found`;
      const result = { toolName, input: parameters, output: null, error, timestamp };
      this.executionHistory.push(result);
      return result;
    }

    const tool = this.tools[toolName];

    try {
      // 入力スキーマの検証
      let validatedInput = parameters;
      if (tool.inputSchema) {
        validatedInput = tool.inputSchema.parse(parameters);
      }

      // ツールの実行
      if (!tool.execute) {
        throw new Error(`Tool "${toolName}" does not have an execute function`);
      }

      const output = await tool.execute({ context: validatedInput }, {
        toolCallId: `tool_${timestamp}`,
        messages: []
      });

      const result = { toolName, input: parameters, output, timestamp };
      this.executionHistory.push(result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const result = { toolName, input: parameters, output: null, error: errorMessage, timestamp };
      this.executionHistory.push(result);
      return result;
    }
  }

  /**
   * ツール実行結果をメッセージ形式で生成
   */
  formatToolResult(result: ToolExecutionResult): string {
    if (result.error) {
      return `Tool execution failed:
- Tool: ${result.toolName}
- Error: ${result.error}
- Input: ${JSON.stringify(result.input, null, 2)}`;
    }

    return `Tool execution completed:
- Tool: ${result.toolName}
- Result: ${JSON.stringify(result.output, null, 2)}`;
  }

  /**
   * 実行履歴を取得
   */
  getExecutionHistory(): ToolExecutionResult[] {
    return [...this.executionHistory];
  }

  /**
   * 実行履歴をクリア
   */
  clearHistory(): void {
    this.executionHistory = [];
  }
}