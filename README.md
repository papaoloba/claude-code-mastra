# Claude Code × Mastra Provider Integration

A TypeScript library that implements a custom Language Model Provider for the Claude Code SDK, enabling seamless integration with the Mastra AI framework through the Vercel AI SDK interface.

## Overview

This library provides a custom provider (`ClaudeCodeProvider`) that implements the Vercel AI SDK's `LanguageModelV1` interface, allowing you to use Claude Code SDK as a language model within Mastra agents. This approach follows the official Mastra pattern for integrating custom language models.

## Features

- 🎯 **Provider Architecture**: Implements Vercel AI SDK's LanguageModelV1 interface for seamless integration
- 🤖 **Claude Code Provider**: Custom language model provider that bridges Claude Code SDK with Mastra
- 🔧 **Tool Integration**: Automatic bridging between Claude Code SDK tools and Mastra tools
- 📨 **Message Conversion**: Seamless message format conversion between frameworks
- 🔄 **Session Management**: Automatic session lifecycle management
- 💰 **Cost Tracking**: Built-in usage and cost tracking
- 🌊 **Streaming Support**: Full support for streaming responses with proper event handling
- ⚡ **Type Safe**: Complete TypeScript type definitions

## Installation

```bash
npm install @anthropic-ai/claude-code @mastra/core
```

## Basic Usage

### Provider Setup

```typescript
import { Agent } from '@mastra/core/agent';
import { ClaudeCodeProvider } from '@t3ta/claude-code-mastra';

// 1. Create the Claude Code provider
const claudeCodeProvider = new ClaudeCodeProvider({
  modelId: 'claude-code-custom',
  claudeCodeOptions: {
    model: 'claude-3-5-sonnet-20241022',
    maxTurns: 10,
    permissionMode: 'default',
    cwd: process.cwd(),
  }
});

// 2. Create a Mastra agent with the provider
const agent = new Agent({
  model: claudeCodeProvider,
  name: 'claude-code-agent',
  instructions: 'You are a helpful coding assistant powered by Claude Code SDK.',
});

// 3. Use the agent
const result = await agent.generate('Write a TypeScript function to calculate fibonacci numbers');
console.log(result.text);
```

### Streaming Responses

```typescript
const messages = [
  { role: 'user' as const, content: 'Create a REST API with Express.js' }
];

const stream = await agent.stream(messages);

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

const output = await stream.output;
console.log('Usage:', output.usage);
console.log('Finish Reason:', output.finishReason);
```

## Provider Configuration

```typescript
interface ClaudeCodeProviderConfig {
  modelId?: string;              // Custom model ID
  claudeCodeOptions?: {          // Claude Code SDK options
    model?: string;              // Claude model name
    maxTurns?: number;           // Max conversation turns
    allowedTools?: string[];     // Allowed Claude Code tools
    disallowedTools?: string[];  // Disallowed Claude Code tools
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
    cwd?: string;                // Working directory
    timeout?: number;            // Timeout in milliseconds
    appendSystemPrompt?: string; // Additional system prompt
    customSystemPrompt?: string; // Override system prompt
    maxThinkingTokens?: number;  // Max thinking tokens
    mcpServers?: Record<string, McpServerConfig>;
  };
  tools?: Record<string, any>;   // Provider-level tools
}
```

## Using with Mastra Tools

```typescript
import { z } from 'zod';

const agent = new Agent({
  model: claudeCodeProvider,
  name: 'assistant',
  instructions: 'You are a helpful assistant with access to tools.',
  tools: {
    calculator: {
      id: 'calculator',
      description: 'Perform mathematical calculations',
      inputSchema: z.object({
        expression: z.string().describe('The mathematical expression to evaluate'),
      }),
      execute: async ({ context }) => {
        // Implementation
        const result = eval(context.expression); // Use a proper math library in production
        return { result };
      },
    },
    weatherTool: {
      id: 'weather',
      description: 'Get weather information',
      inputSchema: z.object({
        city: z.string().describe('City name'),
      }),
      execute: async ({ context }) => {
        // Implementation
        return { 
          city: context.city,
          temperature: 22,
          conditions: 'Sunny'
        };
      },
    },
  },
});

const response = await agent.generate('What is 25 * 4 + 10? Also, what\'s the weather in Tokyo?');
console.log(response.text);
```

## Advanced Features

### Tool Execution Loop

The provider implements an automatic tool execution loop that:
- Detects tool calls in Claude's responses
- Executes the corresponding Mastra tools
- Feeds results back to Claude
- Continues until the task is complete or max iterations reached

### Session Management

The provider includes built-in session management:

```typescript
const provider = new ClaudeCodeProvider({
  modelId: 'claude-code-custom',
});

// Sessions are automatically created and managed
// Each request gets its own session with:
// - Unique session ID
// - Cost tracking
// - Duration tracking
// - Automatic cleanup
```

### Message Conversion

The provider automatically handles message format conversion between:
- Mastra/Vercel AI SDK message format
- Claude Code SDK message format
- Tool execution results

## Examples

### Pre-built Code Assistant Agent

The library includes a pre-configured Code Assistant agent that demonstrates best practices:

```typescript
import { codeAssistant } from '@t3ta/claude-code-mastra/mastra/agents/code-assistant';

// Analyze code
const result = await codeAssistant.generate([
  {
    role: 'user',
    content: 'Analyze this code for improvements: ...'
  }
]);

// Generate tests
const tests = await codeAssistant.generate([
  {
    role: 'user',
    content: 'Generate tests for this function: ...'
  }
]);
```

The Code Assistant includes two custom tools:
- **analyze-code**: Analyzes code quality and suggests improvements
- **generate-tests**: Generates unit tests for code snippets

Run the example:
```bash
npm run example:code-assistant
```

## Architecture

The library follows the official Mastra pattern for custom language model integration:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Mastra Agent  │────▶│ ClaudeCodeProvider│────▶│ Claude Code SDK │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ ToolBridge   │
                        │ MessageConv. │
                        │ SessionMgr.  │
                        └──────────────┘
```

### Key Components

1. **ClaudeCodeProvider**: Implements `LanguageModelV1` interface
   - `doGenerate()`: Non-streaming generation
   - `doStream()`: Streaming generation with event handling

2. **ToolBridge**: Manages tool integration
   - Generates system prompts for tools
   - Detects tool calls in responses
   - Executes tools and formats results

3. **MessageConverter**: Handles message format conversion
   - Extracts prompts from message arrays
   - Cleans Claude Code internal formatting
   - Converts between frameworks

4. **SessionManager**: Manages session lifecycle
   - Creates unique sessions
   - Tracks usage and costs
   - Handles cleanup

## Testing

The project includes comprehensive tests:

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (requires Claude Code authentication)
npm run test:e2e

# All tests
npm run test:all

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Authentication

Claude Code authentication is required:

```bash
# Login to Claude Code
claude login

# Or set via environment variable
export ANTHROPIC_API_KEY=your_api_key
```

## Migration from Agent-based Approach

If you were using the previous `ClaudeCodeAgent` class, migrate to the provider approach:

```typescript
// Old approach
import { ClaudeCodeAgent } from '@t3ta/claude-code-mastra';
const agent = new ClaudeCodeAgent({ /* options */ });

// New approach (recommended)
import { Agent } from '@mastra/core/agent';
import { ClaudeCodeProvider } from '@t3ta/claude-code-mastra';

const provider = new ClaudeCodeProvider({ /* options */ });
const agent = new Agent({ model: provider, /* other options */ });
```

## Security Considerations

⚠️ **Important**: Claude Code SDK tool restrictions (`allowedTools`/`disallowedTools`) may not work as expected. Be cautious with:

- File system operations (Read, Write, Edit)
- Command execution (Bash)
- Resource consumption

**Recommendations**:
- Use Mastra tools instead of Claude Code built-in tools
- Run in sandboxed environments
- Validate all inputs
- Monitor session costs and usage

## License

MIT

## Author

Takahito Mita