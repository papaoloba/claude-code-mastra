# Claude Code × Mastra Agent Integration

This library integrates the Claude Code TypeScript SDK as an Agent within the Mastra framework.

## Overview

This library adapts the Claude Code SDK to the Mastra Agent interface, enabling powerful coding assistance features of Claude Code within the Mastra framework.

## Features

- **Mastra Agent Compatible**: Fully implements the Mastra Framework Agent interface
- **Custom Tools**: Supports Mastra Agent's tools feature
- **MCP External Tools**: Integrates external tools via Model Context Protocol
- **Streaming Support**: Real-time response processing
- **Session Management**: Tracks session state and manages resources
- **Error Handling**: Robust error handling mechanisms
- **Configurable**: Supports Claude Code-specific options
- **Type Safe**: Complete TypeScript type definitions

## Installation

```bash
npm install @anthropic-ai/claude-code @mastra/core
```

## Basic Usage

### Simple Generation

```typescript
import { ClaudeCodeAgent } from './claude-code-agent.js';

const agent = new ClaudeCodeAgent({
  maxTurns: 3,
  permissionMode: 'default'
});

const response = await agent.generate(
  'Write a TypeScript function to calculate fibonacci numbers'
);

console.log(response.content);
console.log(response.metadata); // Session info, cost, etc.
```

### Streaming

```typescript
for await (const chunk of agent.stream('Create a REST API with Express.js')) {
  if (chunk.type === 'content') {
    console.log('Content:', chunk.data.content);
  } else if (chunk.type === 'complete') {
    console.log('Total cost:', chunk.data.totalCost);
  }
}
```

## Configuration Options

```typescript
interface ClaudeCodeAgentOptions {
  maxTurns?: number;                    // Max turns (default: 10)
  allowedTools?: string[];              // Allowed tools
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
  workingDirectory?: string;            // Working directory
  timeout?: number;                     // Timeout (ms, default: 300000)
}
```

## API

### ClaudeCodeAgent

#### constructor(options?: ClaudeCodeAgentOptions)
Creates a new agent instance.

#### generate(prompt: string, options?: Partial<ClaudeCodeAgentOptions>): Promise<MastraResponse>
Generates a single response.

#### stream(prompt: string, options?: Partial<ClaudeCodeAgentOptions>): AsyncIterable<MastraStreamChunk>
Generates streaming responses.

#### getSessionInfo(sessionId: string): SessionInfo | undefined
Retrieves session information.

#### getAllActiveSessions(): SessionInfo[]
Retrieves all active sessions.

#### updateClaudeCodeOptions(options: Partial<ClaudeCodeAgentOptions>): void
Updates default options.

## Response Format

### MastraResponse

```typescript
interface MastraResponse {
  content: string;
  metadata?: {
    sessionId?: string;
    cost?: number;
    duration?: number;
    totalTurns?: number;
  };
}
```

### MastraStreamChunk

```typescript
interface MastraStreamChunk {
  type: 'content' | 'metadata' | 'error' | 'complete';
  data: any;
}
```

## Session Management

The agent automatically manages sessions and provides:

- **Automatic Session Creation**: Creates a new session for each query
- **Cost Tracking**: Tracks execution cost
- **Resource Management**: Automatic cleanup after 30 seconds
- **Session Info**: Monitors active sessions

## Error Handling

```typescript
try {
  const response = await agent.generate('invalid request');
} catch (error) {
  console.error('Generation failed:', error.message);
}

// Error handling in streaming
for await (const chunk of agent.stream('prompt')) {
  if (chunk.type === 'error') {
    console.error('Stream error:', chunk.data.error);
    break;
  }
}
```

## Using Custom Tools

### Tool Definition and Execution

```typescript
import { ClaudeCodeAgent } from './claude-code-agent.js';
import { z } from 'zod';
import type { ToolAction } from '@mastra/core';

// Define a custom tool
const weatherTool: ToolAction = {
  description: 'Get weather information for a city',
  inputSchema: z.object({
    city: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).optional()
  }),
  execute: async ({ context }) => {
    // Actual API call, etc.
    return {
      city: context.city,
      temperature: 22,
      unit: context.unit || 'celsius',
      conditions: 'Sunny'
    };
  }
};

// Create an agent with tools
const agent = new ClaudeCodeAgent({
  name: 'weather-agent',
  instructions: 'You are a weather assistant with access to weather data.',
  model: 'claude-3-5-sonnet-20241022',
  tools: {
    getWeather: weatherTool
  }
});

// Direct tool execution
const weatherData = await agent.executeTool('getWeather', {
  city: 'Tokyo',
  unit: 'celsius'
});

// Using the agent
const response = await agent.generate(
  'What is the weather like in Tokyo?'
);
```

### Dynamic Tool Management

```typescript
// Add a tool
agent.addTool('calculator', {
  description: 'Perform calculations',
  inputSchema: z.object({
    expression: z.string()
  }),
  execute: async ({ context }) => {
    // Calculation logic
    return { result: eval(context.expression) };
  }
});

// Check available tools
console.log(agent.getToolNames()); // ['getWeather', 'calculator']
console.log(agent.getToolDescriptions());

// Remove a tool
agent.removeTool('calculator');
```

## Advanced Usage

### Dynamic Option Updates

```typescript
const agent = new ClaudeCodeAgent();

// Update default options
agent.updateClaudeCodeOptions({
  maxTurns: 5,
  allowedTools: ['Edit', 'Read', 'Write'],
  permissionMode: 'bypassPermissions'
});

// Override options for a specific query
const response = await agent.generate('prompt', {
  maxTurns: 1,
  timeout: 30000
});
```

### Session Monitoring

```typescript
// Monitor active sessions
console.log('Active sessions:', agent.getAllActiveSessions().length);

// Get info for a specific session
const sessionInfo = agent.getSessionInfo(sessionId);
if (sessionInfo) {
  console.log('Session cost:', sessionInfo.totalCost);
  console.log('Session duration:', Date.now() - sessionInfo.startTime);
}
```

## File Structure

- `claude-code-agent.ts` - Main ClaudeCodeAgent class
- `message-converter.ts` - Message conversion utilities
- `types.ts` - TypeScript type definitions
- `utils.ts` - Helper functions and session management
- `example.ts` - Usage examples and demo code

## Requirements

- Node.js 18+
- TypeScript 4.9+
- `@anthropic-ai/claude-code` ^1.0.35
- `@mastra/core` ^0.10.8

## Authentication

Claude Code authentication is required:

```bash
# Login to Claude Code
claude login

# Or set via environment variable
export ANTHROPIC_API_KEY=your_api_key
```

## Testing

This project includes a comprehensive test suite:

### Test Types

#### Unit Tests
```bash
npm run test:unit
```
Tests individual components and methods (with mocks).

#### Component Integration Tests
```bash
npm run test:integration
```
Tests integration between components (with mocks).

#### E2E Tests
```bash
npm run test:e2e
```
Tests integration with the actual Claude Code SDK (real API calls).

⚠️ **Note**: E2E tests require:
- Claude Code CLI setup: `claude login`
- Valid Anthropic API key
- Internet connection
- Possible API credit consumption

#### All Tests
```bash
npm run test        # All tests except E2E
npm run test:all    # Run all tests
npm run test:watch  # Watch mode
npm run test:ui     # UI test runner
npm run test:coverage # With coverage
```

### Test Results

- **73 unit/integration tests**
- **9 E2E tests**
- **Full coverage**: All major features covered
- **Performance tests**: Response time and concurrency
- **Error handling tests**: Abnormal case verification

## Development

```bash
# Type checking during development
npm run typecheck

# Build
npm run build

# Test in watch mode
npm run test:watch
```

## Security and Limitations

### Current Limitations

Currently, the built-in tool restriction features (`allowedTools`/`disallowedTools`) of the Claude Code SDK may not work as expected. Please note the following security risks:

#### **High Risk**

1. **Unintended File Operations**
   ```typescript
   // If Write, Edit, Bash tools are not restricted
   agent.generate("Delete important files");
   // → May actually perform file operations
   ```

2. **Arbitrary Command Execution**
   ```typescript
   // Arbitrary system command execution via Bash tool
   agent.generate("npm install malicious-package");
   // → May change the system
   ```

3. **System Resource Abuse**
   ```typescript
   // Unlimited file reading
   agent.generate("Read all files");
   // → Heavy I/O load
   ```

#### **Recommended Countermeasures**

1. **Careful control in production**
   - Only process trusted input
   - Run in a sandbox environment without important files
   - Set appropriate permissions

2. **Prefer Mastra tools**
   ```typescript
   // Define and use safe custom tools
   const agent = new ClaudeCodeAgent({
     tools: {
       safeTool: {
         description: 'Performs only safe operations',
         // Controlled implementation
       }
     }
   });
   ```

3. **Session Monitoring**
   ```typescript
   // Monitor session info and control cost
   const sessions = agent.getAllActiveSessions();
   sessions.forEach(session => {
     if (session.totalCost > threshold) {
       agent.stopSession(session.sessionId);
     }
   });
   ```

### Planned Fixes

Tool restriction features will be fixed in future updates. Currently, the core features (tool execution, result return, session management) work as intended.

## License

MIT

## Author

Takahito Mita
