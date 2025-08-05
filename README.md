# Claude Code × Mastra Integration

A powerful TypeScript library that bridges Claude Code SDK with the Mastra framework, enabling seamless AI agent development with Claude's advanced capabilities.

## 🌟 Features

- **Vercel AI SDK Compatible**: Implements LanguageModelV1 interface for drop-in compatibility
- **Intelligent Tool Bridge**: Automatic conflict resolution between Claude Code and Mastra tools
- **Streaming Support**: Full streaming capabilities with tool execution
- **Session Management**: Automatic session lifecycle with cost and duration tracking
- **Type Safety**: Complete TypeScript support with comprehensive type definitions
- **MCP Server Support**: Configure Model Context Protocol servers for extended capabilities

## 📦 Installation

```bash
npm install @papaoloba/claude-code-mastra
```

## 🚀 Quick Start

### Basic Usage with ClaudeCodeProvider

```typescript
import { ClaudeCodeProvider } from '@papaoloba/claude-code-mastra';
import { generateText } from 'ai';

// Create a provider instance
const provider = new ClaudeCodeProvider({
  modelId: 'claude-code-assistant',
  claudeCodeOptions: {
    model: 'claude-3-5-sonnet-20241022',
    maxTurns: 10,
    permissionMode: 'default'
  }
});

// Use with Vercel AI SDK
const result = await generateText({
  model: provider,
  prompt: 'Write a function to calculate fibonacci numbers'
});

console.log(result.text);
```

### Using with Mastra Agents

```typescript
import { Agent } from '@mastra/core/agent';
import { ClaudeCodeProvider } from '@papaoloba/claude-code-mastra';

const codeAssistant = new Agent({
  name: 'Code Assistant',
  description: 'AI assistant powered by Claude Code',
  model: new ClaudeCodeProvider({
    claudeCodeOptions: {
      model: 'claude-3-5-sonnet-20241022',
      maxTurns: 5
    }
  }),
  tools: {
    // Your Mastra tools here
  }
});

// Execute the agent
const response = await codeAssistant.generate('Help me refactor this code...');
```

### Streaming Responses

```typescript
import { streamText } from 'ai';

const stream = await streamText({
  model: provider,
  prompt: 'Explain async/await in JavaScript'
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

## 🛠️ Advanced Configuration

### Custom Tools Integration

```typescript
import { ClaudeCodeProvider } from '@papaoloba/claude-code-mastra';
import { createTool } from '@mastra/core';

// Define custom tools
const calculatorTool = createTool({
  name: 'calculator',
  description: 'Performs mathematical calculations',
  inputSchema: z.object({
    expression: z.string()
  }),
  execute: async ({ context }) => {
    return eval(context.expression); // Note: Use a proper math parser in production
  }
});

// Create provider with tools
const provider = new ClaudeCodeProvider({
  tools: {
    calculator: calculatorTool
  }
});
```

### MCP Server Configuration

```typescript
const provider = new ClaudeCodeProvider({
  claudeCodeOptions: {
    mcpServers: {
      myServer: {
        type: 'stdio',
        command: 'node',
        args: ['./mcp-server.js'],
        env: { API_KEY: process.env.MCP_API_KEY }
      }
    }
  }
});
```

## 📚 API Reference

### ClaudeCodeProvider

The main class that implements Vercel AI SDK's LanguageModelV1 interface.

```typescript
class ClaudeCodeProvider implements LanguageModelV1 {
  constructor(config?: ClaudeCodeProviderConfig)
  
  // LanguageModelV1 implementation
  doGenerate(options): Promise<GenerateResult>
  doStream(options): Promise<StreamResult>
}
```

#### Configuration Options

```typescript
interface ClaudeCodeProviderConfig {
  modelId?: string;                    // Model identifier
  claudeCodeOptions?: {                // Claude Code SDK options
    maxTurns?: number;                 // Max conversation turns (1-100)
    allowedTools?: string[];           // Allowed Claude Code tools
    disallowedTools?: string[];        // Disallowed Claude Code tools
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    cwd?: string;                      // Working directory
    timeout?: number;                  // Timeout in milliseconds
    model?: string;                    // Claude model to use
    fallbackModel?: string;            // Fallback model
    appendSystemPrompt?: string;       // Additional system prompt
    customSystemPrompt?: string;       // Replace system prompt
    maxThinkingTokens?: number;        // Max thinking tokens
    mcpServers?: Record<string, McpServerConfig>;
  };
  tools?: Record<string, ToolAction>; // Mastra tools
}
```

### Utility Classes

#### ToolBridge

Handles integration between Claude Code SDK and Mastra tools.

```typescript
class ToolBridge {
  generateSystemPrompt(): string
  detectToolCall(message: string): { toolName: string; parameters: any } | null
  executeTool(toolName: string, parameters: any): Promise<ToolExecutionResult>
  formatToolResult(result: ToolExecutionResult): string
  getExecutionHistory(): ToolExecutionResult[]
  clearHistory(): void
}
```

#### MessageConverter

Converts between Claude Code SDK messages and Mastra formats.

```typescript
class MessageConverter {
  extractPromptFromMessages(messages: any[]): string
  convertSDKMessageToMastraResponse(messages: SDKMessage[], sessionId: string, startTime: number): MastraResponse
  convertSDKMessageToStreamChunk(message: SDKMessage): MastraStreamChunk
  createErrorChunk(error: Error | string, sessionId?: string): MastraStreamChunk
  createMetadataChunk(metadata: any, sessionId?: string): MastraStreamChunk
}
```

#### SessionManager

Manages Claude Code session lifecycle.

```typescript
class SessionManager {
  createSession(): SessionInfo
  getSession(sessionId: string): SessionInfo | undefined
  updateSession(sessionId: string, updates: Partial<SessionInfo>): void
  endSession(sessionId: string): void
  cleanupSession(sessionId: string): void
}
```

## 📋 Pre-built Agents & Workflows

### CSV Question Agent

An agent specialized in processing CSV files and generating educational questions.

```typescript
import { csvQuestionAgent } from '@papaoloba/claude-code-mastra/mastra';

const response = await csvQuestionAgent.generate(
  'Download this CSV and generate questions: https://example.com/data.csv'
);
```

### CSV to Questions Workflow

A complete workflow for CSV processing:

```typescript
import { mastra } from '@papaoloba/claude-code-mastra/mastra';

const result = await mastra.workflows.csvToQuestionsWorkflow.execute({
  csvUrl: 'https://example.com/data.csv'
});

console.log(result.questions);
```

## 🧪 Testing

The project includes comprehensive test suites:

```bash
# Unit tests (mocked)
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (requires Claude Code auth)
CLAUDE_CODE_E2E_TEST=true npm run test:e2e

# All tests
npm run test:all

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## ⚠️ Security Considerations

**Important**: Claude Code SDK tool restrictions (`allowedTools`/`disallowedTools`) may not work as expected. This can lead to:
- Unrestricted file system access
- Arbitrary command execution via Bash tool
- Resource abuse potential

**Recommendations**:
1. Use in sandboxed environments
2. Prefer Mastra tools over Claude Code built-in tools
3. Implement additional security layers in production
4. Monitor resource usage and set appropriate timeouts

## 🔧 Development

### Project Structure

```
claude-code-mastra/
├── src/
│   ├── claude-code-provider.ts    # Main provider implementation
│   ├── tool-bridge.ts             # Tool integration logic
│   ├── message-converter.ts       # Message format conversion
│   ├── utils.ts                   # Utilities and session management
│   ├── types.ts                   # TypeScript type definitions
│   └── mastra/                    # Pre-built Mastra components
│       ├── agents/                # Pre-configured agents
│       ├── tools/                 # Custom tools
│       └── workflows/             # Workflow definitions
├── test/
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── e2e/                       # End-to-end tests
└── examples/                      # Usage examples
```

### Building

```bash
# TypeScript compilation
npm run build

# Type checking
npm run typecheck
```

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🔗 Links

- [GitHub Repository](https://github.com/t3ta/claude-code-mastra)
- [Claude Code SDK](https://github.com/anthropics/claude-code)
- [Mastra Framework](https://mastra.ai)
- [Vercel AI SDK](https://sdk.vercel.ai)