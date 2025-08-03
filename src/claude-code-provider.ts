// claude-code-provider.ts

import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-code';
import { MessageConverter } from './message-converter.js';
import { SessionManager } from './utils.js';
import { ToolBridge } from './tool-bridge.js';
import type {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';

interface ClaudeCodeProviderConfig {
  modelId?: string;
  claudeCodeOptions?: any;
  tools?: Record<string, any>;
}

/**
 * Implements the Vercel AI SDK's LanguageModelV1 interface to serve as
 * a custom provider for the Claude Code SDK.
 */
export class ClaudeCodeProvider implements LanguageModelV1 {
  readonly specificationVersion = 'v1' as const;
  readonly defaultObjectGenerationMode = 'tool' as const;
  readonly provider = 'claude-code-provider';
  readonly modelId: string;
  
  private config: ClaudeCodeProviderConfig;
  private messageConverter: MessageConverter;
  private sessionManager: SessionManager;
  private toolBridge: ToolBridge;
  
  constructor(config: ClaudeCodeProviderConfig = {}) {
    this.config = config;
    this.modelId = config.modelId || 'claude-code-custom';
    this.messageConverter = new MessageConverter();
    this.sessionManager = new SessionManager();
    this.toolBridge = new ToolBridge(config.tools || {});
  }

  /**
   * Implements the non-streaming generation logic.
   */
  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const { prompt, abortSignal, mode } = options;
    const messages = prompt; // prompt is already the messages array
    const tools = mode.type === 'regular' ? mode.tools : undefined;
    const promptText = this.messageConverter.extractPromptFromMessages(messages);
    const claudeOptions = this.createClaudeCodeOptions(options);
    const sdkMessages: SDKMessage[] = [];
    let currentPrompt = promptText;
    const maxIterations = 5;
    let iterationCount = 0;
    let finalUsage = { promptTokens: 0, completionTokens: 0 };
    let finalFinishReason: Awaited<ReturnType<LanguageModelV1['doGenerate']>>['finishReason'] = 'stop';
    const warnings: LanguageModelV1CallWarning[] = [];

    // Clear tool history at the start
    this.toolBridge.clearHistory();

    // Add tool system prompt if tools are available
    if (tools && Object.keys(tools).length > 0) {
      const toolsSystemPrompt = this.toolBridge.generateSystemPrompt();
      if (toolsSystemPrompt) {
        currentPrompt = `${toolsSystemPrompt}\n\n${currentPrompt}`;
      }
    }

    while (iterationCount < maxIterations) {
      if (abortSignal?.aborted) {
        throw new Error('Generation aborted');
      }

      const iterationMessages: SDKMessage[] = [];
      await this.collectMessages(currentPrompt, claudeOptions, iterationMessages);
      sdkMessages.push(...iterationMessages);

      const lastResult = iterationMessages.find(m => m.type === 'result');
      if (lastResult && lastResult.usage) {
        finalUsage.promptTokens += lastResult.usage.input_tokens || 0;
        finalUsage.completionTokens += lastResult.usage.output_tokens || 0;
      }

      const lastMessage = this.getLastAssistantContent(iterationMessages);
      if (!lastMessage) break;

      const toolCall = this.toolBridge.detectToolCall(lastMessage);
      if (!toolCall) break;

      finalFinishReason = 'tool-calls';
      const toolResult = await this.toolBridge.executeTool(toolCall.toolName, toolCall.parameters);
      const resultMessage = this.toolBridge.formatToolResult(toolResult);
      currentPrompt = `${resultMessage}\n\nPlease continue with the task.`;
      iterationCount++;
    }

    const finalContent = this.getLastAssistantContent(sdkMessages);
    const toolCalls = this.toolBridge.getExecutionHistory().map(h => ({
      toolCallType: 'function' as const,
      toolCallId: h.timestamp.toString(),
      toolName: h.toolName,
      args: JSON.stringify(h.input),
    }));

    return {
      rawCall: { rawPrompt: promptText, rawSettings: claudeOptions },
      text: finalContent || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: finalFinishReason,
      usage: {
        promptTokens: finalUsage.promptTokens,
        completionTokens: finalUsage.completionTokens,
      },
      warnings,
    };
  }

  /**
   * Implements the streaming generation logic.
   */
  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const { prompt, abortSignal, mode } = options;
    const messages = prompt; // prompt is already the messages array
    const tools = mode.type === 'regular' ? mode.tools : undefined;
    const promptText = this.messageConverter.extractPromptFromMessages(messages);
    const claudeOptions = this.createClaudeCodeOptions(options);
    const self = this;
    const warnings: LanguageModelV1CallWarning[] = [];

    // Clear tool history at the start
    this.toolBridge.clearHistory();

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      async start(controller) {
        let totalUsage = { promptTokens: 0, completionTokens: 0 };
        let finishReason: Awaited<ReturnType<LanguageModelV1['doGenerate']>>['finishReason'] = 'stop';

        try {
          let currentPrompt = promptText;
          
          // Add tool system prompt if tools are available
          if (tools && Object.keys(tools).length > 0) {
            const toolsSystemPrompt = self.toolBridge.generateSystemPrompt();
            if (toolsSystemPrompt) {
              currentPrompt = `${toolsSystemPrompt}\n\n${currentPrompt}`;
            }
          }

          const maxIterations = 5;
          let iterationCount = 0;

          while (iterationCount < maxIterations) {
            if (abortSignal?.aborted) {
              controller.error(new Error('Stream aborted'));
              return;
            }

            const queryIterator = query({ prompt: currentPrompt, options: claudeOptions });
            const iterationMessages: SDKMessage[] = [];
            let streamedText = false;

            for await (const message of queryIterator) {
              iterationMessages.push(message);
              
              // Handle streaming text
              if ((message as any).type === 'stream' && typeof (message as any).content === 'string') {
                controller.enqueue({ 
                  type: 'text-delta', 
                  textDelta: (message as any).content 
                });
                streamedText = true;
              }
              
              // Collect usage data
              if (message.type === 'result' && message.usage) {
                totalUsage.promptTokens += message.usage.input_tokens || 0;
                totalUsage.completionTokens += message.usage.output_tokens || 0;
              }
            }

            const lastResult = iterationMessages.find(m => m.type === 'result');
            if (lastResult && 'result' in lastResult && typeof lastResult.result === 'string' && !streamedText) {
              controller.enqueue({ 
                type: 'text-delta', 
                textDelta: lastResult.result 
              });
            }

            const lastMessageContent = self.getLastAssistantContent(iterationMessages);
            if (!lastMessageContent) break;

            const toolCall = self.toolBridge.detectToolCall(lastMessageContent);
            if (!toolCall) break;

            finishReason = 'tool-calls';
            const toolCallId = `tool_${Date.now()}`;
            controller.enqueue({ 
              type: 'tool-call', 
              toolCallType: 'function',
              toolCallId, 
              toolName: toolCall.toolName, 
              args: JSON.stringify(toolCall.parameters) 
            });

            const toolResult = await self.toolBridge.executeTool(toolCall.toolName, toolCall.parameters);
            
            // Note: tool-result is not a valid stream part type in the AI SDK
            // Tool results are handled internally and fed back to the model

            const resultMessage = self.toolBridge.formatToolResult(toolResult);
            currentPrompt = `${resultMessage}\n\nPlease continue with the task.`;
            iterationCount++;
          }
        } catch (error) {
          controller.error(error);
          return;
        } finally {
          // Crucial: Enqueue the 'finish' event with final usage and finishReason
          controller.enqueue({ 
            type: 'finish', 
            finishReason: finishReason, 
            usage: {
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
            }
          });
          controller.close();
        }
      },
    });

    return { 
      stream, 
      rawCall: { rawPrompt: promptText, rawSettings: claudeOptions },
      warnings,
    };
  }

  // --- Helper Methods ---
  private createClaudeCodeOptions(options: any): Options {
    // Merges default config with per-request options
    return { ...this.config.claudeCodeOptions, ...options };
  }

  private async collectMessages(prompt: string, claudeOptions: Options, messages: SDKMessage[]) {
    for await (const message of query({ prompt, options: claudeOptions })) {
      messages.push(message);
    }
  }

  private getLastAssistantContent(messages: SDKMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.type === 'assistant' && (message as any).message) {
        const msg = (message as any).message;
        let content: string | undefined;
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = msg.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join(' ');
        }
        if (content) return content;
      } else if (message?.type === 'result' && 'result' in message && typeof message.result === 'string') {
        return message.result;
      }
    }
    return null;
  }
}