import type { ClaudeCodeAgentOptions, SessionInfo, McpServerConfig } from './types.js';

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();

  createSession(): SessionInfo {
    const sessionId = this.generateSessionId();
    const session: SessionInfo = {
      sessionId,
      startTime: Date.now(),
      totalCost: 0,
      totalTurns: 0,
      isActive: true
    };
    
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId: string, updates: Partial<SessionInfo>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
    }
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
    }
  }

  cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export function validateOptions(options?: ClaudeCodeAgentOptions): Required<ClaudeCodeAgentOptions> {
  const defaultOptions: Required<ClaudeCodeAgentOptions> = {
    maxTurns: 10,
    allowedTools: [],
    disallowedTools: [],
    permissionMode: 'default',
    cwd: process.cwd(),
    timeout: 300000, // 5 minutes
    model: 'claude-3-5-sonnet-20241022',
    fallbackModel: 'claude-3-5-haiku-20241022',
    appendSystemPrompt: '',
    customSystemPrompt: '',
    maxThinkingTokens: 0,
    mcpServers: {}
  };

  if (!options) {
    return defaultOptions;
  }

  return {
    maxTurns: validateMaxTurns(options.maxTurns) ?? defaultOptions.maxTurns,
    allowedTools: validateAllowedTools(options.allowedTools) ?? defaultOptions.allowedTools,
    disallowedTools: validateAllowedTools(options.disallowedTools) ?? defaultOptions.disallowedTools,
    permissionMode: validatePermissionMode(options.permissionMode) ?? defaultOptions.permissionMode,
    cwd: validateWorkingDirectory(options.cwd) ?? defaultOptions.cwd,
    timeout: validateTimeout(options.timeout) ?? defaultOptions.timeout,
    model: options.model ?? defaultOptions.model,
    fallbackModel: options.fallbackModel ?? defaultOptions.fallbackModel,
    appendSystemPrompt: options.appendSystemPrompt ?? defaultOptions.appendSystemPrompt,
    customSystemPrompt: options.customSystemPrompt ?? defaultOptions.customSystemPrompt,
    maxThinkingTokens: options.maxThinkingTokens ?? defaultOptions.maxThinkingTokens,
    mcpServers: validateMCPServers(options.mcpServers) ?? defaultOptions.mcpServers
  };
}

function validateMaxTurns(maxTurns?: number): number | undefined {
  if (maxTurns === undefined) return undefined;
  if (typeof maxTurns !== 'number' || maxTurns < 1 || maxTurns > 100) {
    throw new Error('maxTurns must be a number between 1 and 100');
  }
  return maxTurns;
}

function validateAllowedTools(allowedTools?: string[]): string[] | undefined {
  if (allowedTools === undefined) return undefined;
  if (!Array.isArray(allowedTools)) {
    throw new Error('allowedTools must be an array of strings');
  }
  return allowedTools.filter(tool => typeof tool === 'string');
}

function validatePermissionMode(permissionMode?: string): 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | undefined {
  if (permissionMode === undefined) return undefined;
  const validModes = ['default', 'acceptEdits', 'bypassPermissions', 'plan'] as const;
  if (!validModes.includes(permissionMode as any)) {
    throw new Error(`permissionMode must be one of: ${validModes.join(', ')}`);
  }
  return permissionMode as 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
}

function validateWorkingDirectory(workingDirectory?: string): string | undefined {
  if (workingDirectory === undefined) return undefined;
  if (typeof workingDirectory !== 'string') {
    throw new Error('workingDirectory must be a string');
  }
  return workingDirectory;
}

function validateTimeout(timeout?: number): number | undefined {
  if (timeout === undefined) return undefined;
  if (typeof timeout !== 'number' || timeout < 1000 || timeout > 3600000) {
    throw new Error('timeout must be a number between 1000ms (1s) and 3600000ms (1h)');
  }
  return timeout;
}

function validateMCPServers(mcpServers?: Record<string, McpServerConfig>): Record<string, McpServerConfig> | undefined {
  if (mcpServers === undefined) return undefined;
  
  if (typeof mcpServers !== 'object' || mcpServers === null) {
    throw new Error('mcpServers must be an object');
  }
  
  // 各サーバー設定の検証
  for (const [serverName, serverConfig] of Object.entries(mcpServers)) {
    if (!serverConfig || typeof serverConfig !== 'object') {
      throw new Error(`mcpServers.${serverName} must be an object`);
    }
    
    if (!serverConfig.type || !['stdio', 'sse', 'http'].includes(serverConfig.type)) {
      throw new Error(`mcpServers.${serverName}.type must be one of: stdio, sse, http`);
    }
    
    if (serverConfig.type === 'stdio') {
      if (!serverConfig.command || typeof serverConfig.command !== 'string') {
        throw new Error(`mcpServers.${serverName}.command must be a string`);
      }
      
      if (serverConfig.args && !Array.isArray(serverConfig.args)) {
        throw new Error(`mcpServers.${serverName}.args must be an array`);
      }
      
      if (serverConfig.env && typeof serverConfig.env !== 'object') {
        throw new Error(`mcpServers.${serverName}.env must be an object`);
      }
    } else if (serverConfig.type === 'sse' || serverConfig.type === 'http') {
      if (!serverConfig.url || typeof serverConfig.url !== 'string') {
        throw new Error(`mcpServers.${serverName}.url must be a string`);
      }
      
      if (serverConfig.headers && typeof serverConfig.headers !== 'object') {
        throw new Error(`mcpServers.${serverName}.headers must be an object`);
      }
    }
  }
  
  return mcpServers;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

export function createTimeoutPromise<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}