import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-code';
import { Agent } from '@mastra/core';
import type { ToolAction } from '@mastra/core';
// import { MastraAgentStream } from '@mastra/core/stream/MastraAgentStream';
import { z } from 'zod';
import type { 
  CoreMessage
} from 'ai';
import type {
  ClaudeCodeAgentOptions,
  MastraStreamChunk,
  SessionInfo,
  ToolsInput
} from './types.js';
import type { 
  GenerateTextResult,
  GenerateObjectResult,
  StreamTextResult,
  StreamObjectResult
} from '@mastra/core';
import type { ZodSchema } from 'zod';
import type { JSONSchema7 } from 'json-schema';

// Define agent option types locally to avoid import issues
type AgentGenerateOptions<OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined, EXPERIMENTAL_OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined> = {
  instructions?: string;
  maxSteps?: number;
  output?: OUTPUT;
  experimental_output?: EXPERIMENTAL_OUTPUT;
  [key: string]: any;
};

type AgentStreamOptions<OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined, EXPERIMENTAL_OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined> = {
  instructions?: string;
  maxSteps?: number;
  output?: OUTPUT;
  experimental_output?: EXPERIMENTAL_OUTPUT;
  [key: string]: any;
};

type AiMessageType = {
  role: string;
  content: string;
  [key: string]: any;
};

type UIMessageWithMetadata = {
  role: string;
  content: string;
  metadata?: any;
  [key: string]: any;
};
import { MessageConverter } from './message-converter.js';
import { SessionManager, validateOptions, formatError } from './utils.js';
import { ToolBridge } from './tool-bridge.js';

export class ClaudeCodeAgent extends Agent {
  // Mastraの基底クラスのメソッドシグネチャと互換性を保つため、anyでオーバーライド
  private sessionManager: SessionManager;
  private messageConverter: MessageConverter;
  private claudeOptions: Required<ClaudeCodeAgentOptions>;
  private _tools: ToolsInput;
  private toolBridge: ToolBridge;

  constructor(config: any & { claudeCodeOptions?: ClaudeCodeAgentOptions; tools?: ToolsInput }) {
    super(config);
    this.sessionManager = new SessionManager();
    this.messageConverter = new MessageConverter();
    this.claudeOptions = validateOptions(config.claudeCodeOptions);
    this._tools = config.tools || {};
    this.toolBridge = new ToolBridge(this._tools);
  }

  // Override generate method with proper Mastra signature
  public override async generate<
    Tools extends ToolSet,
    Output extends ZodSchema | JSONSchema7 | undefined = undefined,
    ExperimentalOutput extends ZodSchema | JSONSchema7 | undefined = undefined,
  >(
    optionsOrMessages: AgentGenerateOptions<Output, ExperimentalOutput> | any,
    legacyOptions?: any
  ): Promise<GenerateReturn<Tools, Output, ExperimentalOutput>> {

    console.log('🚀 Debug - Starting generate with params:', typeof optionsOrMessages, !!legacyOptions);

    // Handle both calling conventions for compatibility
    let options: AgentGenerateOptions<Output, ExperimentalOutput>;
    let messages: any[];
    
    if (typeof optionsOrMessages === 'object' && !Array.isArray(optionsOrMessages) && 'messages' in optionsOrMessages) {
      // Standard Mastra style: generate(options)
      options = optionsOrMessages;
      messages = options.messages || [];
    } else {
      // Legacy style: generate(messages, options) - used by Mastra server
      messages = Array.isArray(optionsOrMessages) ? optionsOrMessages : [optionsOrMessages];
      options = legacyOptions || {};
    }
    
    console.log('🚀 Debug - Extracted messages:', messages.length);
    console.log('🚀 Debug - Options:', Object.keys(options));

    const session = this.sessionManager.createSession();
    const prompt = this.extractPromptFromMessages(messages);
    
    // ツール履歴をクリア
    console.log('🚀 Debug - Clearing tool history');
    this.toolBridge.clearHistory();
    
    // オプションをマージ
    const mergedOptions = { ...this.claudeOptions, ...this.extractClaudeOptionsFromArgs(options) };
    console.log('🚀 Debug - Merged options:', mergedOptions);

    // Mastraツールがある場合は、Claude Code内蔵ツールを無効化し、Mastraツールのみを使用
    const toolsSystemPrompt = this.toolBridge.generateSystemPrompt();
    console.log('🚀 Debug - Tools system prompt:', toolsSystemPrompt);

    if (toolsSystemPrompt && !mergedOptions.customSystemPrompt) {
      // Claude Code内蔵ツールを無効化
      mergedOptions.disallowedTools = ['Task', 'Bash', 'Read', 'Write', 'Edit', 'LS', 'Glob', 'Grep'];
      console.log('🚀 Debug - Disallowed tools:', mergedOptions.disallowedTools);
      mergedOptions.appendSystemPrompt = mergedOptions.appendSystemPrompt 
        ? `${mergedOptions.appendSystemPrompt}\n\n${toolsSystemPrompt}`
        : toolsSystemPrompt;
    }
    
    try {
      const claudeOptions = this.createClaudeCodeOptions(mergedOptions);
      console.log('🚀 Debug - Created Claude options:', claudeOptions);
      const sdkMessages: SDKMessage[] = [];
      const startTime = Date.now();

      // ツール実行ループ
      let currentPrompt = prompt;
      let iterationCount = 0;
      const maxIterations = 5; // 無限ループを防ぐ

      console.log('🚀 Debug - Starting tool execution loop, max iterations:', maxIterations);
      console.log('🚀 Debug - Available tools:', Object.keys(this._tools));

      while (iterationCount < maxIterations) {
        console.log(`🔄 Debug - Iteration ${iterationCount + 1}/${maxIterations}`);

        const iterationMessages: SDKMessage[] = [];
        console.log('🚀 Debug - Collecting messages: ', currentPrompt);
        await this.collectMessages(currentPrompt, claudeOptions, iterationMessages);
        console.log('📨 Debug - Received messages count:', iterationMessages.length);
        console.log('📨 Debug - Message types:', iterationMessages.map(m => m.type));
        
        sdkMessages.push(...iterationMessages);

        // ツール呼び出しを検出
        // Debug: simplified message logging
        console.log('📨 Debug - Assistant messages:', iterationMessages
          .filter(m => m.type === 'assistant')
          .map((m, i) => `[${i}] ${m.type}`)
        );
        
        const lastMessage = this.getLastAssistantContent(iterationMessages);
        console.log('🔍 Debug - Last assistant message:', lastMessage?.substring(0, 200) + '...');
        
        if (!lastMessage) {
          console.log('❌ Debug - No last message found');
          break;
        }
        
        const toolCall = this.toolBridge.detectToolCall(lastMessage);
        console.log('🔍 Debug - Tool call detected:', toolCall);
        
        if (!toolCall) {
          console.log('❌ Debug - No tool call detected, breaking loop');
          break; // ツール呼び出しがなければ終了
        }

        console.log('✅ Debug - Executing tool:', toolCall.toolName, 'with params:', toolCall.parameters);
        
        // ツールを実行
        const toolResult = await this.toolBridge.executeTool(toolCall.toolName, toolCall.parameters);
        console.log('✅ Debug - Tool execution result:', toolResult);
        
        const resultMessage = this.toolBridge.formatToolResult(toolResult);
        
        currentPrompt = `${resultMessage}\n\nPlease continue with the task using this information.`;
        iterationCount++;
      }

      console.log('🚀 Debug - Ending session');
      this.sessionManager.endSession(session.sessionId);

      console.log('🚀 Debug - Converting SDK messages to Mastra response');
      const mastraResponse = this.messageConverter.convertSDKMessageToMastraResponse(
        sdkMessages,
        session.sessionId,
        startTime
      );

      console.log('🚀 Debug - Converted SDK messages to Mastra response: ', mastraResponse);

      // ツール実行履歴から toolCalls と toolResults を生成
      const toolHistory = this.toolBridge.getExecutionHistory();
      const toolCalls: any[] = [];
      const toolResults: any[] = [];

      toolHistory.forEach(execution => {
        const toolCallId = `call_${execution.timestamp}`;
        
        // ToolCall
        toolCalls.push({
          type: 'tool-call',
          toolCallId,
          toolName: execution.toolName,
          args: execution.input
        });

        // ToolResult
        toolResults.push({
          type: 'tool-result',
          toolCallId,
          toolName: execution.toolName,
          args: execution.input,
          result: execution.output,
          isError: !!execution.error
        });
      });

      // Check if structured output is requested
      const hasOutput = options?.output || options?.structuredOutput;
      const hasExperimentalOutput = options?.experimental_output;
      
      if (hasOutput) {
        // Return GenerateObjectResult for structured output
        const objectResponse: GenerateObjectResult<any> = {
          object: {}, // This would need to be parsed from the actual response
          finishReason: 'stop' as const,
          usage: {
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0
          },
          warnings: undefined,
          logprobs: undefined,
          providerMetadata: {
            claudeCode: {
              sessionId: mastraResponse.metadata?.sessionId || '',
              cost: mastraResponse.metadata?.cost || 0,
              duration: mastraResponse.metadata?.duration || 0
            }
          } as any,
          experimental_providerMetadata: {
            claudeCode: {
              sessionId: mastraResponse.metadata?.sessionId || '',
              cost: mastraResponse.metadata?.cost || 0,
              duration: mastraResponse.metadata?.duration || 0
            }
          } as any,
          request: {
            body: JSON.stringify({ messages, ...options })
          } as any,
          response: {
            id: session.sessionId,
            timestamp: new Date(),
            modelId: mergedOptions.model || 'claude-3-5-sonnet-20241022'
          } as any,
          toJsonResponse: () => new Response(JSON.stringify({
            object: {},
            finishReason: 'stop' as const,
            usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 }
          }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        };
        return objectResponse;
      }
      
      // Create the assistant response message
      const responseMessage: CoreMessage = {
        role: 'assistant',
        content: mastraResponse.content || ''
      };

      // Create a response that matches GenerateTextResult interface
      const response: GenerateTextResult<any, any> = {
        // Core properties
        text: mastraResponse.content || '',
        toolCalls: toolCalls,
        toolResults: toolResults,
        finishReason: 'stop' as const,
        usage: {
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0
        },
        // Required properties for AI SDK compatibility
        steps: [],
        request: {
          body: JSON.stringify({ messages, ...options })
        } as any,
        response: {
          id: session.sessionId,
          timestamp: new Date(),
          modelId: mergedOptions.model || 'claude-3-5-sonnet-20241022',
          messages: [responseMessage]  // Add messages array like in dummy agent
        } as any,
        logprobs: undefined,
        providerMetadata: {
          claudeCode: {
            sessionId: mastraResponse.metadata?.sessionId || '',
            cost: mastraResponse.metadata?.cost || 0,
            duration: mastraResponse.metadata?.duration || 0
          }
        } as any,
        warnings: undefined,
        // Optional properties - only include object if experimental output is requested
        ...(hasExperimentalOutput && { object: {} }),
        reasoning: undefined,
        files: [],
        reasoningDetails: [],
        sources: [],
        runId: options.runId || session.sessionId  // Add runId like in dummy agent
      } as any;

      console.log('🚀 Debug - Final response text:', response.text);
      console.log('🚀 Debug - Response type check:', 'text' in response, 'finishReason' in response);
      console.log('🚀 Debug - Response structure:', Object.keys(response));
      console.log('🚀 Debug - Text is string:', typeof response.text === 'string');
      console.log('🚀 Debug - Text is not empty:', response.text.length > 0);
      
      // Ensure the response is a plain object (not a class instance)
      const plainResponse = JSON.parse(JSON.stringify(response));
      console.log('🚀 Debug - Returning plain object response');
      return plainResponse;

    } catch (error) {
      this.sessionManager.endSession(session.sessionId);
      throw new Error(`Claude Code execution failed: ${formatError(error)}`);
    } finally {
      setTimeout(() => {
        this.sessionManager.cleanupSession(session.sessionId);
      }, 30000);
    }
  }

  // Stream method overloads to match Mastra Agent interface
  async stream<OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined, EXPERIMENTAL_OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined>(
    messages: string | string[] | CoreMessage[] | AiMessageType[] | UIMessageWithMetadata[],
    args?: AgentStreamOptions<OUTPUT, EXPERIMENTAL_OUTPUT> & {
      output?: never;
      experimental_output?: never;
    }
  ): Promise<StreamTextResult<any, OUTPUT extends ZodSchema ? any : unknown>>;
  
  async stream<OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined>(
    messages: string | string[] | CoreMessage[] | AiMessageType[] | UIMessageWithMetadata[],
    args?: AgentStreamOptions<OUTPUT, undefined> & {
      output?: OUTPUT;
      experimental_output?: never;
    }
  ): Promise<StreamObjectResult<any>>;
  
  async stream<EXPERIMENTAL_OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined>(
    messages: string | string[] | CoreMessage[] | AiMessageType[] | UIMessageWithMetadata[],
    args?: AgentStreamOptions<undefined, EXPERIMENTAL_OUTPUT> & {
      output?: never;
      experimental_output?: EXPERIMENTAL_OUTPUT;
    }
  ): Promise<StreamTextResult<any, EXPERIMENTAL_OUTPUT extends ZodSchema ? any : unknown> & {
    partialObjectStream: any;
  }>;
  
  // Override stream method with proper Mastra signature  
  public override async stream<
    Tools extends ToolSet,
    Output extends ZodSchema | JSONSchema7 | undefined = undefined,
    ExperimentalOutput extends ZodSchema | JSONSchema7 | undefined = undefined,
  >(
    options: AgentStreamOptions<Output, ExperimentalOutput>,
  ): Promise<MastraAgentStream<Tools, Output, ExperimentalOutput>> {

    console.log('🚀 Debug - Starting stream with options:', Object.keys(options));

    const session = this.sessionManager.createSession();
    const messages = options.messages || [];
    const prompt = this.extractPromptFromMessages(messages);
    
    // ツール履歴をクリア
    this.toolBridge.clearHistory();
    
    // オプションをマージ
    const mergedOptions = { ...this.claudeOptions, ...this.extractClaudeOptionsFromArgs(options) };
    
    // Mastraツールがある場合は、Claude Code内蔵ツールを無効化し、Mastraツールのみを使用
    const toolsSystemPrompt = this.toolBridge.generateSystemPrompt();
    if (toolsSystemPrompt && !mergedOptions.customSystemPrompt) {
      // Claude Code内蔵ツールを無効化
      mergedOptions.disallowedTools = ['Task', 'Bash', 'Read', 'Write', 'Edit', 'LS', 'Glob', 'Grep'];
      
      mergedOptions.appendSystemPrompt = mergedOptions.appendSystemPrompt 
        ? `${mergedOptions.appendSystemPrompt}\n\n${toolsSystemPrompt}`
        : toolsSystemPrompt;
    }
    
    const chunks: MastraStreamChunk[] = [];
    
    try {
      const claudeOptions = this.createClaudeCodeOptions(mergedOptions);
      
      chunks.push(this.messageConverter.createMetadataChunk(
        { status: 'started', options: mergedOptions },
        session.sessionId
      ));

      // ツール実行ループ（ストリーミング版）
      let currentPrompt = prompt;
      let iterationCount = 0;
      const maxIterations = 5;

      while (iterationCount < maxIterations) {
        const iterationMessages: SDKMessage[] = [];
        const queryIterator = query({ prompt: currentPrompt, options: claudeOptions });

        for await (const message of queryIterator) {
          this.updateSessionFromMessage(session.sessionId, message);
          chunks.push(this.messageConverter.convertSDKMessageToStreamChunk(message));
          iterationMessages.push(message);
        }

        // ツール呼び出しを検出
        const lastMessage = this.getLastAssistantContent(iterationMessages);
        if (!lastMessage) {
          break;
        }
        
        const toolCall = this.toolBridge.detectToolCall(lastMessage);
        if (!toolCall) {
          break; // ツール呼び出しがなければ終了
        }

        // ツールを実行
        const toolResult = await this.toolBridge.executeTool(toolCall.toolName, toolCall.parameters);
        const resultMessage = this.toolBridge.formatToolResult(toolResult);
        
        // ツール実行結果をメタデータチャンクとして追加
        chunks.push(this.messageConverter.createMetadataChunk(
          { toolExecution: { name: toolCall.toolName, result: toolResult.output, error: toolResult.error } },
          session.sessionId
        ));
        
        currentPrompt = `${resultMessage}\n\nPlease continue with the task using this information.`;
        iterationCount++;
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

    // ツール実行履歴から toolCalls と toolResults を生成
    const toolHistory = this.toolBridge.getExecutionHistory();
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    toolHistory.forEach(execution => {
      const toolCallId = `call_${execution.timestamp}`;
      
      // ToolCall
      toolCalls.push({
        type: 'tool-call',
        toolCallId,
        toolName: execution.toolName,
        args: execution.input
      });

      // ToolResult
      toolResults.push({
        type: 'tool-result',
        toolCallId,
        toolName: execution.toolName,
        args: execution.input,
        result: execution.output,
        isError: !!execution.error
      });
    });

    // Return a simple stream result for now
    // TODO: Replace with MastraAgentStream when import is resolved
    return {
      textStream: this.createAsyncIterable(chunks) as any,
      text: this.getTextFromChunks(chunks),
      toolCalls: Promise.resolve(toolCalls.length > 0 ? toolCalls : []),
      toolResults: Promise.resolve(toolResults.length > 0 ? toolResults : []),
      usage: Promise.resolve({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }),
      finishReason: Promise.resolve('stop' as const),
      experimental_providerMetadata: Promise.resolve({ 
        sessionId: session.sessionId
      })
    } as any;
  }

  private async collectMessages(
    prompt: string,
    claudeOptions: Options,
    messages: SDKMessage[]
  ): Promise<void> {
    console.log('🚀 Debug - starting collectMessages');

    for await (const message of query({ prompt, options: claudeOptions })) {
      console.log('🚀 Debug - Collected message:', message);
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

    if (options.mcpServers) {
      claudeOptions.mcpServers = options.mcpServers;
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
    console.log('🚀 Debug - Stopping session: ', sessionId);
    this.sessionManager.endSession(sessionId);
  }

  // Claude Code固有のメソッド
  updateClaudeCodeOptions(options: Partial<ClaudeCodeAgentOptions>): void {
    console.log('🚀 Debug - Updating Claude Code options: ', options);
    this.claudeOptions = validateOptions({ ...this.claudeOptions, ...options });
  }

  getClaudeCodeOptions(): Required<ClaudeCodeAgentOptions> {
    console.log('🚀 Debug - Getting Claude Code options: ', this.claudeOptions);
    return { ...this.claudeOptions };
  }

  // Mastra Agent Tools メソッド
  getTools(): ToolsInput {
    console.log('🚀 Debug - Getting tools: ', this._tools);
    return { ...this._tools };
  }

  getToolNames(): string[] {
    console.log('🚀 Debug - Getting tool names: ', Object.keys(this._tools));
    return Object.keys(this._tools);
  }

  getToolDescriptions(): Record<string, string> {
    console.log('🚀 Debug - Getting tool descriptions: ', Object.entries(this._tools));
    const descriptions: Record<string, string> = {};
    for (const [name, tool] of Object.entries(this._tools)) {
      descriptions[name] = tool.description;
    }
    return descriptions;
  }

  async executeTool(toolName: string, input: any): Promise<any> {
    console.log('🚀 Debug - Executing tool: ', toolName, input);
    const tool = this._tools[toolName];
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found`);
    }

    // 入力スキーマの検証
    if (tool.inputSchema) {
      try {
        const validatedInput = tool.inputSchema.parse(input);
        input = validatedInput;
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(`Invalid input for tool "${toolName}": ${error.message}`);
        }
        throw error;
      }
    }

    // ツールの実行
    if (!tool.execute) {
      throw new Error(`Tool "${toolName}" does not have an execute function`);
    }

    return await tool.execute({ context: input }, {
      toolCallId: `tool_${Date.now()}`,
      messages: []
    });
  }

  addTool(name: string, tool: ToolAction<any, any, any>): void {
    console.log('🚀 Debug - Adding tool: ', name, tool);
    this._tools[name] = tool;
  }

  removeTool(name: string): void {
    console.log('🚀 Debug - Removing tool: ', name);
    delete this._tools[name];
  }

  private getLastAssistantContent(messages: SDKMessage[]): string | null {
    console.log('🚀 Debug - Getting last assistant content: ', messages);
    // 最後のアシスタントメッセージの内容を取得
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message && message.type === 'assistant') {
        let content: string | undefined;
        
        // 直接contentフィールドがある場合
        if ('content' in message && typeof message.content === 'string') {
          content = message.content;
        } 
        // message.message.contentの構造の場合
        else if ('message' in message && message.message && typeof message.message === 'object') {
          const innerMessage = message.message as any;
          if ('content' in innerMessage && typeof innerMessage.content === 'string') {
            content = innerMessage.content;
          }
          // content配列の場合
          else if (Array.isArray(innerMessage.content)) {
            content = innerMessage.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join(' ');
          }
        }
        
        console.log('🔍 Debug - Extracted content:', content?.substring(0, 200) + '...');
        if (content) return content;
      }
    }
    return null;
  }

  // ヘルパーメソッド
  private extractPromptFromMessages(messages: string | string[] | CoreMessage[] | AiMessageType[] | UIMessageWithMetadata[]): string {
    console.log('🚀 Debug - Extracting prompt from messages: ', messages);
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
    console.log('🚀 Debug - Extracting Claude Code options from args: ', args);
    if (!args) return {};
    
    return {
      maxTurns: args.maxSteps,
      // argsから他のClaudeCode関連オプションがあれば変換
    };
  }

  private async *createAsyncIterable(chunks: MastraStreamChunk[]): AsyncIterable<string> {
    console.log('🚀 Debug - Creating async iterable: ', chunks);
    for (const chunk of chunks) {
      if (chunk.type === 'content' && chunk.data.content) {
        yield chunk.data.content;
      }
    }
  }

  private getTextFromChunks(chunks: MastraStreamChunk[]): Promise<string> {
    console.log('🚀 Debug - Getting text from chunks: ', chunks);
    const contentChunks = chunks
      .filter(chunk => chunk.type === 'content' && chunk.data.content)
      .map(chunk => chunk.data.content);
    return Promise.resolve(contentChunks.join(''));
  }
}