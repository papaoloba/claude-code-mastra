import { ClaudeCodeAgent } from '../../claude-code-agent.js';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { weatherTool } from '../tools/weather-tool';
import { anthropic } from '@ai-sdk/anthropic';

// Create a Claude Code agent with Mastra tools integration
export const claudeCodeAgent = new ClaudeCodeAgent({
  name: 'Claude Code Agent',
  instructions: `
    You are Claude Code, an AI programming assistant with access to the Claude Code SDK.
    You can help users with software development tasks including:
    - Writing and reviewing code
    - Debugging and troubleshooting
    - Explaining code concepts
    - Refactoring and optimization
    - Creating tests and documentation
    
    You have access to the weather tool which you can use to get weather information when needed.
    
    Approach each task systematically and provide clear, helpful responses.
  `,
  // Provide a model to satisfy Mastra Agent base class requirement
  // The actual model is managed internally by ClaudeCodeAgent through claude-code SDK
  model: anthropic('claude-3-5-sonnet-20241022') as any,
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db', // path is relative to the .mastra/output directory
    }),
  }),
  // Claude Code specific options
  claudeCodeOptions: {
    maxTurns: 5,
    model: 'claude-3-5-sonnet-20241022',
    cwd: process.cwd(),
    permissionMode: 'default',
    // Disable Claude Code built-in tools when Mastra tools are present
    // This is handled automatically by the ClaudeCodeAgent
  }
});