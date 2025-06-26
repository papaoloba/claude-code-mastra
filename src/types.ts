export interface ClaudeCodeAgentOptions {
  maxTurns?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  cwd?: string;
  timeout?: number;
  model?: string;
  fallbackModel?: string;
  appendSystemPrompt?: string;
  customSystemPrompt?: string;
  maxThinkingTokens?: number;
  mcpServers?: Record<string, McpServerConfig>;
}

// Claude Code SDKのMCPサーバー設定型を再定義
export type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

export interface McpStdioServerConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface MastraResponse {
  content: string;
  metadata?: {
    sessionId?: string;
    cost?: number;
    duration?: number;
    totalTurns?: number;
    isError?: boolean;
  };
}

export interface MastraStreamChunk {
  type: 'content' | 'metadata' | 'error' | 'complete';
  data: any;
}

export interface SessionInfo {
  sessionId: string;
  startTime: number;
  totalCost: number;
  totalTurns: number;
  isActive: boolean;
  isError?: boolean;
}

export interface ErrorDetails {
  code: string;
  message: string;
  originalError?: any;
}