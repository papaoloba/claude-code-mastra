import { Agent } from '@mastra/core';

export class ClaudeCodeAgent extends Agent {
  constructor(config: any);
  
  generate(optionsOrMessages: any, legacyOptions?: any): Promise<any>;
  stream(messagesOrOptions: any, args?: any): Promise<any>;
  
  getSessionInfo(sessionId: string): any;
  getAllActiveSessions(): any[];
  stopSession(sessionId: string): Promise<void>;
  
  updateClaudeCodeOptions(options: any): void;
  getClaudeCodeOptions(): any;
  
  getTools(): any;
  getToolNames(): string[];
  getToolDescriptions(): Record<string, string>;
  executeTool(toolName: string, input: any): Promise<any>;
  addTool(name: string, tool: any): void;
  removeTool(name: string): void;
}