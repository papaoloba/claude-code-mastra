import type {
  MastraResponse,
  MastraStreamChunk,
  ErrorDetails
} from './types.js';
import type { SDKMessage } from '@anthropic-ai/claude-code';

export class MessageConverter {
  private extractContentFromMessage(message: any): string {
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
            return block.text;
          }
          if (block.type === 'tool_use') {
            return `[Tool: ${block.name}]`;
          }
          if (block.type === 'tool_result') {
            return `[Tool Result: ${block.content || 'completed'}]`;
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
            return block.text;
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