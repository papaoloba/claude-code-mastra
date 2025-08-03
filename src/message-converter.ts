import type {
  MastraResponse,
  MastraStreamChunk,
  ErrorDetails
} from './types.js';
import type { SDKMessage } from '@anthropic-ai/claude-code';

export class MessageConverter {
  /**
   * Extract prompt from messages array (for provider compatibility)
   */
  extractPromptFromMessages(messages: any[] = []): string {
    return messages
      .map(msg => {
        if (typeof msg.content === 'string') {
          return msg.content;
        }
        if (Array.isArray(msg.content)) {
          return msg.content
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text || '')
            .join('');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Claude Code SDKの内部表示（[tool: xxx]など）をクリーンアップ
   */
  private cleanClaudeCodeInternalText(text: string): string {
    if (!text) return '';
    
    // Claude Code SDKの内部表示パターンを除去
    return text
      // [tool: xxx] パターンを除去
      .replace(/^\[tool:\s*[^\]]+\]\s*\n*/gm, '')
      // [Tool: xxx] パターンを除去（大文字バリエーション）
      .replace(/^\[Tool:\s*[^\]]+\]\s*\n*/gm, '')
      // [TOOL: xxx] パターンを除去
      .replace(/^\[TOOL:\s*[^\]]+\]\s*\n*/gm, '')
      // その他の類似パターン
      .replace(/^\[[A-Za-z_]+:\s*[^\]]+\]\s*\n*/gm, '')
      // 行頭の空白行を除去
      .replace(/^\s*\n/gm, '')
      // 文字列の前後の余分な空白を除去
      .trim();
  }

  private extractContentFromMessage(message: any): string {
    // Claude Code SDKのメッセージは直接contentフィールドを持つ場合がある
    if (typeof message === 'string') {
      return this.cleanClaudeCodeInternalText(message);
    }
    
    if (typeof message.content === 'string') {
      return this.cleanClaudeCodeInternalText(message.content);
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((block: any) => {
          if (!block || typeof block !== 'object') {
            return '';
          }
          if (block.type === 'text' && block.text) {
            return this.cleanClaudeCodeInternalText(block.text);
          }
          if (block.type === 'tool_use') {
            // ツール使用の詳細は表示しない（内部処理）
            return '';
          }
          if (block.type === 'tool_result') {
            // ツール結果の内容のみを返す（メタデータは除く）
            return typeof block.content === 'string' ? block.content : '';
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    return '';
  }

  convertSDKMessageToMastraResponse(
    messages: SDKMessage[],
    sessionId: string,
    startTime: number
  ): MastraResponse {
    const assistantMessages = messages.filter(msg => msg.type === 'assistant');
    const resultMessage = messages.find(msg => msg.type === 'result');

    let content = '';
    if (assistantMessages.length > 0) {
      content = assistantMessages.map(msg => this.extractContentFromMessage(msg.message)).join('\n\n');
    } else if (resultMessage && 'result' in resultMessage) {
      content = resultMessage.result || '';
    }

    const duration = Date.now() - startTime;
    const isError = resultMessage ? resultMessage.is_error : false;

    return {
      content,
      metadata: {
        sessionId,
        cost: resultMessage?.total_cost_usd,
        duration,
        totalTurns: resultMessage?.num_turns || assistantMessages.length,
        isError
      }
    };
  }

  convertSDKMessageToStreamChunk(message: SDKMessage): MastraStreamChunk {
    switch (message.type) {
      case 'assistant':
        return {
          type: 'content',
          data: {
            content: this.extractContentFromMessage(message.message),
            sessionId: message.session_id,
            usage: (message.message as any).usage,
            stopReason: (message.message as any).stop_reason
          }
        };

      case 'user':
        return {
          type: 'metadata',
          data: {
            userMessage: this.extractUserContent(message.message),
            sessionId: message.session_id
          }
        };

      case 'result':
        return {
          type: 'complete',
          data: {
            result: 'result' in message ? message.result : undefined,
            totalCost: message.total_cost_usd,
            sessionId: message.session_id,
            isError: message.is_error,
            duration: message.duration_ms
          }
        };

      case 'system':
        return {
          type: 'metadata',
          data: {
            systemInfo: {
              cwd: message.cwd,
              tools: message.tools,
              model: message.model,
              permissionMode: message.permissionMode
            },
            sessionId: message.session_id
          }
        };

      default:
        return {
          type: 'metadata',
          data: message
        };
    }
  }

  private extractUserContent(message: any): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((block: any) => {
          if (!block || typeof block !== 'object') {
            return '';
          }
          if (block.type === 'text' && block.text) {
            return this.cleanClaudeCodeInternalText(block.text);
          }
          if (block.type === 'image') {
            return '[Image]';
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    return '';
  }

  createErrorChunk(error: Error | string, sessionId?: string): MastraStreamChunk {
    const errorDetails: ErrorDetails = {
      code: 'CLAUDE_CODE_ERROR',
      message: typeof error === 'string' ? error : error.message,
      originalError: typeof error === 'object' ? error : undefined
    };

    return {
      type: 'error',
      data: {
        error: errorDetails,
        sessionId
      }
    };
  }

  createMetadataChunk(metadata: any, sessionId?: string): MastraStreamChunk {
    return {
      type: 'metadata',
      data: {
        ...metadata,
        sessionId
      }
    };
  }
}