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