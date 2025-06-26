import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-code';
import { Agent } from '@mastra/core';
import type {
  ClaudeCodeAgentOptions,
  MastraResponse,
  MastraStreamChunk,
  SessionInfo
} from './types.js';
import { MessageConverter } from './message-converter.js';
import { SessionManager, validateOptions, formatError } from './utils.js';

export class ClaudeCodeAgent extends Agent {
  private sessionManager: SessionManager;
  private messageConverter: MessageConverter;
  private claudeOptions: Required<ClaudeCodeAgentOptions>;

  constructor(config: any & { claudeCodeOptions?: ClaudeCodeAgentOptions }) {
    super(config);
    this.sessionManager = new SessionManager();
    this.messageConverter = new MessageConverter();
    this.claudeOptions = validateOptions(config.claudeCodeOptions);
  }

  async generate(
    messages: string | string[] | any[],
    args?: any
  ): Promise<any> {
    const session = this.sessionManager.createSession();
    const prompt = this.extractPromptFromMessages(messages);
    const mergedOptions = { ...this.claudeOptions, ...this.extractClaudeOptionsFromArgs(args) };
    
    try {
      const claudeOptions = this.createClaudeCodeOptions(mergedOptions);
      const sdkMessages: SDKMessage[] = [];
      const startTime = Date.now();

      await this.collectMessages(prompt, claudeOptions, sdkMessages);

      this.sessionManager.endSession(session.sessionId);
      
      const mastraResponse = this.messageConverter.convertSDKMessageToMastraResponse(
        sdkMessages,
        session.sessionId,
        startTime
      );

      return {
        text: mastraResponse.content,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        },
        finishReason: 'stop',
        experimental_providerMetadata: mastraResponse.metadata
      };

    } catch (error) {
      this.sessionManager.endSession(session.sessionId);
      throw new Error(`Claude Code execution failed: ${formatError(error)}`);
    } finally {
      setTimeout(() => {
        this.sessionManager.cleanupSession(session.sessionId);
      }, 30000);
    }
  }

  async stream(
    messages: string | string[] | any[],
    args?: any
  ): Promise<any> {
    const session = this.sessionManager.createSession();
    const prompt = this.extractPromptFromMessages(messages);
    const mergedOptions = { ...this.claudeOptions, ...this.extractClaudeOptionsFromArgs(args) };
    
    const chunks: MastraStreamChunk[] = [];
    
    try {
      const claudeOptions = this.createClaudeCodeOptions(mergedOptions);
      
      chunks.push(this.messageConverter.createMetadataChunk(
        { status: 'started', options: mergedOptions },
        session.sessionId
      ));

      const queryIterator = query({ prompt, options: claudeOptions });

      for await (const message of queryIterator) {
        this.updateSessionFromMessage(session.sessionId, message);
        chunks.push(this.messageConverter.convertSDKMessageToStreamChunk(message));
      }

      this.sessionManager.endSession(session.sessionId);
      chunks.push(this.messageConverter.createMetadataChunk(
        { status: 'completed' },
        session.sessionId
      ));

    } catch (error) {
      this.sessionManager.endSession(session.sessionId);
      chunks.push(this.messageConverter.createErrorChunk(formatError(error), session.sessionId));
    } finally {
      setTimeout(() => {
        this.sessionManager.cleanupSession(session.sessionId);
      }, 30000);
    }

    // StreamTextResultを返すために、シンプルなストリームオブジェクトを作成
    return {
      textStream: this.createAsyncIterable(chunks),
      text: this.getTextFromChunks(chunks),
      usage: Promise.resolve({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }),
      finishReason: Promise.resolve('stop' as const),
      experimental_providerMetadata: Promise.resolve({ sessionId: session.sessionId })
    };
  }

  private async collectMessages(
    prompt: string,
    claudeOptions: Options,
    messages: SDKMessage[]
  ): Promise<void> {
    for await (const message of query({ prompt, options: claudeOptions })) {
      messages.push(message);
    }
  }

  private createClaudeCodeOptions(options: Required<ClaudeCodeAgentOptions>): Options {
    const claudeOptions: Options = {
      maxTurns: options.maxTurns,
      cwd: options.cwd
    };

    if (options.allowedTools.length > 0) {
      claudeOptions.allowedTools = options.allowedTools;
    }

    if (options.disallowedTools.length > 0) {
      claudeOptions.disallowedTools = options.disallowedTools;
    }

    if (options.permissionMode !== 'default') {
      claudeOptions.permissionMode = options.permissionMode;
    }

    if (options.model) {
      claudeOptions.model = options.model;
    }

    if (options.fallbackModel) {
      claudeOptions.fallbackModel = options.fallbackModel;
    }

    if (options.appendSystemPrompt) {
      claudeOptions.appendSystemPrompt = options.appendSystemPrompt;
    }

    if (options.customSystemPrompt) {
      claudeOptions.customSystemPrompt = options.customSystemPrompt;
    }

    if (options.maxThinkingTokens > 0) {
      claudeOptions.maxThinkingTokens = options.maxThinkingTokens;
    }

    return claudeOptions;
  }

  private updateSessionFromMessage(sessionId: string, message: SDKMessage): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    if (message.type === 'assistant') {
      this.sessionManager.updateSession(sessionId, {
        totalTurns: session.totalTurns + 1
      });
    }

    if (message.type === 'result') {
      this.sessionManager.updateSession(sessionId, {
        totalCost: message.total_cost_usd,
        isError: message.is_error
      });
    }
  }

  getSessionInfo(sessionId: string): SessionInfo | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  getAllActiveSessions(): SessionInfo[] {
    const sessions: SessionInfo[] = [];
    for (const session of this.sessionManager['sessions'].values()) {
      if (session.isActive) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.sessionManager.endSession(sessionId);
  }

  // Claude Code固有のメソッド
  updateClaudeCodeOptions(options: Partial<ClaudeCodeAgentOptions>): void {
    this.claudeOptions = validateOptions({ ...this.claudeOptions, ...options });
  }

  getClaudeCodeOptions(): Required<ClaudeCodeAgentOptions> {
    return { ...this.claudeOptions };
  }

  // ヘルパーメソッド
  private extractPromptFromMessages(messages: string | string[] | any[]): string {
    if (typeof messages === 'string') {
      return messages;
    }
    if (Array.isArray(messages)) {
      if (typeof messages[0] === 'string') {
        return (messages as string[]).join('\n');
      }
      return (messages as any[])
        .map(msg => typeof msg.content === 'string' ? msg.content : '')
        .filter(Boolean)
        .join('\n');
    }
    return '';
  }

  private extractClaudeOptionsFromArgs(args?: any): Partial<ClaudeCodeAgentOptions> {
    if (!args) return {};
    
    return {
      maxTurns: args.maxSteps,
      // argsから他のClaudeCode関連オプションがあれば変換
    };
  }

  private async *createAsyncIterable(chunks: MastraStreamChunk[]): AsyncIterable<string> {
    for (const chunk of chunks) {
      if (chunk.type === 'content' && chunk.data.content) {
        yield chunk.data.content;
      }
    }
  }

  private getTextFromChunks(chunks: MastraStreamChunk[]): Promise<string> {
    const contentChunks = chunks
      .filter(chunk => chunk.type === 'content' && chunk.data.content)
      .map(chunk => chunk.data.content);
    return Promise.resolve(contentChunks.join(''));
  }
}