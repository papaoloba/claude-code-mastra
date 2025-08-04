# Guide: Implementing a Custom Claude Code Provider for Mastra

This guide provides the definitive architecture for integrating a custom language model, like the Claude Code SDK, into the Mastra framework.

### Architectural Overview: The Provider Model

The core mistake in our previous attempts was trying to subclass `mastra.Agent`. The `Agent` class is a high-level abstraction for orchestrating prompts and tools, not for implementing the raw connection to a new Language Model (LLM).

The correct, idiomatic pattern is to create a **Language Model Provider**. This is a class that conforms to the Vercel AI SDK's `LanguageModelV1` interface. Mastra uses this same interface, aliased as `MastraLanguageModel`.

By creating a provider, you let the Mastra framework handle:
-   The complex streaming lifecycle.
-   The `toDataStreamResponse` function and other UI-facing utilities.
-   The orchestration of tool calls and results.

Your provider's only job is to implement the logic for communicating with the Claude Code SDK and translating its output into the standardized event format that Mastra understands.

### Final File Structure

Your project should be organized as follows. This structure separates the core provider logic from the helper utilities.

```
.
├── claude-code-provider.js  # <-- The new, core provider logic.
├── message-converter.js     # (Helper utility)
├── tool-bridge.js           # (Helper utility)
├── utils.js                 # (Helper utility)
└── index.js                 # <-- Example of how to use the new provider.
```

---

## Step-by-Step Implementation

### Step 1: Create the `claude-code-provider.js` File

This is the most important file. It implements the `LanguageModelV1` interface. The two key methods are `doGenerate` (for non-streaming calls) and `doStream` (for streaming calls).

**Key Refinements based on `agent.test.ts`:**

*   **`doGenerate`**: The returned object should include `rawCall`, `finishReason`, `usage`, and `text`. The `usage` object should be populated from the Claude Code SDK's `result` message. The `finishReason` is typically `'stop'` for non-streaming calls unless an explicit tool call was made and the model stopped to wait for its result. `toolCalls` and `toolResults` are returned as arrays in the final result object.
*   **`doStream`**: This is where the most significant changes are. The `ReadableStream` should enqueue specific event types:
    *   `{ type: 'text-delta', textDelta: '...' }` for text chunks.
    *   `{ type: 'tool-call', ... }` when a tool is invoked.
    *   `{ type: 'tool-result', ... }` when a tool returns a result.
    *   Crucially, a **`{ type: 'finish', finishReason: '...', usage: { ... } }`** event must be enqueued at the very end of the stream. This `finish` event is how `MastraAgentStream` (and the underlying AI SDK) collects the final `usage` and `finishReason` for the entire stream. Without it, the stream might appear to hang or report incorrect usage. The `rawCall` property is also expected in the `doStream` return. Note that `toolCalls` and `toolResults` are enqueued as individual events within the stream, not returned as a single array at the end.

```javascript
// /Users/paolobarbato/Documents/Development/mastra/claude-code-provider.js

import { query } from '@anthropic-ai/claude-code';
import { z } from 'zod';
import { MessageConverter } from './message-converter.js';
import { SessionManager, validateOptions, formatError } from './utils.js';
import { ToolBridge } from './tool-bridge.js';

/**
 * Implements the Vercel AI SDK's LanguageModelV1 interface to serve as
 * a custom provider for the Claude Code SDK.
 */
export class ClaudeCodeProvider {
  constructor(config = {}) {
    this.config = config;
    this.messageConverter = new MessageConverter();
    this.sessionManager = new SessionManager();
    this.toolBridge = new ToolBridge(config.tools || {});
  }

  // Required by the LanguageModelV1 interface
  get provider() {
    return 'claude-code-provider';
  }

  // Required by the LanguageModelV1 interface
  get modelId() {
    return this.config.modelId || 'claude-code-custom';
  }

  /**
   * Implements the non-streaming generation logic.
   */
  async doGenerate(options) {
    const { messages, tools } = options;
    const prompt = this.messageConverter.extractPromptFromMessages(messages);
    const claudeOptions = this.createClaudeCodeOptions(options);
    const sdkMessages = [];
    let currentPrompt = prompt;
    const maxIterations = 5;
    let iterationCount = 0;
    let finalUsage = { promptTokens: 0, completionTokens: 0 };
    let finalFinishReason = 'stop';

    while (iterationCount < maxIterations) {
      const iterationMessages = [];
      await this.collectMessages(currentPrompt, claudeOptions, iterationMessages);
      sdkMessages.push(...iterationMessages);

      const lastResult = iterationMessages.find(m => m.type === 'result');
      if (lastResult && lastResult.usage) {
        finalUsage.promptTokens += lastResult.usage.input_tokens || 0;
        finalUsage.completionTokens += lastResult.usage.output_tokens || 0;
      }

      const lastMessage = this.getLastAssistantContent(iterationMessages);
      if (!lastMessage) break;

      const toolCall = this.toolBridge.detectToolCall(lastMessage);
      if (!toolCall) break;

      finalFinishReason = 'tool-calls'; // If a tool call is detected, the reason is tool-calls
      const toolResult = await this.toolBridge.executeTool(toolCall.toolName, toolCall.parameters);
      const resultMessage = this.toolBridge.formatToolResult(toolResult);
      currentPrompt = `${resultMessage}\n\nPlease continue with the task.`
      iterationCount++;
    }

    const finalContent = this.getLastAssistantContent(sdkMessages);
    const toolCalls = this.toolBridge.getExecutionHistory().map(h => ({
      toolCallId: h.timestamp.toString(),
      toolName: h.toolName,
      args: h.input,
    }));

    return {
      rawCall: { rawPrompt: prompt, rawSettings: claudeOptions }, // Added rawCall
      text: finalContent,
      toolCalls: toolCalls,
      finishReason: finalFinishReason,
      usage: finalUsage,
    };
  }

  /**
   * Implements the streaming generation logic.
   */
  async doStream(options) {
    const { messages, tools } = options;
    const prompt = this.messageConverter.extractPromptFromMessages(messages);
    const claudeOptions = this.createClaudeCodeOptions(options);
    const self = this;

    const stream = new ReadableStream({
      async start(controller) {
        let totalUsage = { promptTokens: 0, completionTokens: 0 };
        let finishReason = 'stop';

        try {
          let currentPrompt = prompt;
          const maxIterations = 5;
          let iterationCount = 0;

          while (iterationCount < maxIterations) {
            const queryIterator = query({ prompt: currentPrompt, options: claudeOptions });
            const iterationMessages = [];
            let streamedText = false;

            for await (const message of queryIterator) {
              iterationMessages.push(message);
              if (message.type === 'stream' && typeof message.content === 'string') {
                controller.enqueue({ type: 'text-delta', textDelta: message.content });
                streamedText = true;
              }
              if (message.type === 'result' && message.usage) {
                totalUsage.promptTokens += message.usage.input_tokens || 0;
                totalUsage.completionTokens += message.usage.output_tokens || 0;
              }
            }

            const lastResult = iterationMessages.find(m => m.type === 'result');
            if (lastResult && lastResult.result && !streamedText) {
              controller.enqueue({ type: 'text-delta', textDelta: lastResult.result });
            }

            const lastMessageContent = self.getLastAssistantContent(iterationMessages);
            if (!lastMessageContent) break;

            const toolCall = self.toolBridge.detectToolCall(lastMessageContent);
            if (!toolCall) break;

            finishReason = 'tool-calls'; // If a tool call is detected, the reason is tool-calls
            const toolCallId = `tool_${Date.now()}`;
            controller.enqueue({ type: 'tool-call', toolCallId, toolName: toolCall.toolName, args: toolCall.parameters });

            const toolResult = await self.toolBridge.executeTool(toolCall.toolName, toolCall.parameters);
            controller.enqueue({ type: 'tool-result', toolCallId, toolName: toolCall.toolName, result: toolResult.output, isError: !!toolResult.error });

            const resultMessage = self.toolBridge.formatToolResult(toolResult);
            currentPrompt = `${resultMessage}\n\nPlease continue with the task.`
            iterationCount++;
          }
        } catch (error) {
          controller.error(error);
        } finally {
          // Crucial: Enqueue the 'finish' event with final usage and finishReason
          controller.enqueue({ type: 'finish', finishReason: finishReason, usage: totalUsage });
          controller.close();
        }
      },
    });

    return { stream, rawCall: { rawPrompt: prompt, rawSettings: claudeOptions } }; // Added rawCall
  }

  // --- Helper Methods ---
  createClaudeCodeOptions(options) {
    // Merges default config with per-request options
    return { ...this.config.claudeCodeOptions, ...options };
  }

  async collectMessages(prompt, claudeOptions, messages) {
    for await (const message of query({ prompt, options: claudeOptions })) {
      messages.push(message);
    }
  }

  getLastAssistantContent(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.type === 'assistant') {
        let content;
        if (typeof message.content === 'string') content = message.content;
        else if (message.message && typeof message.message.content === 'string') content = message.message.content;
        else if (message.message && Array.isArray(message.message.content)) content = message.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
        if (content) return content;
      }
    }
    return null;
  }
}
```

### Step 2: Ensure Helper Utilities Exist

These remain the same as before.

<details>
<summary><code>message-converter.js</code></summary>

```javascript
// /Users/paolobarbato/Documents/Development/mastra/message-converter.js
export class MessageConverter {
  extractPromptFromMessages(messages = []) {
    return messages
      .map(msg => (typeof msg.content === 'string' ? msg.content : ''))
      .filter(Boolean)
      .join('\n');
  }

  convertSDKMessageToMastraResponse(sdkMessages, sessionId, startTime) {
    const finalMessage = sdkMessages.reverse().find(m => m.type === 'result');
    return {
      content: finalMessage?.result || '',
      metadata: {
        sessionId,
        cost: finalMessage?.total_cost_usd || 0,
        duration: Date.now() - startTime,
      },
    };
  }
}
```
</details>

<details>
<summary><code>tool-bridge.js</code></summary>

```javascript
// /Users/paolobarbato/Documents/Development/mastra/tool-bridge.js
export class ToolBridge {
  constructor(tools = {}) {
    this._tools = tools;
    this.history = [];
  }
  clearHistory() { this.history = []; }
  getExecutionHistory() { return this.history; }
  generateSystemPrompt() { /* ... logic to generate a system prompt for tools ... */ return ''; }
  detectToolCall(text) { /* ... logic to parse tool calls from LLM text ... */ return null; }
  async executeTool(toolName, parameters) {
    const result = { output: `Executed ${toolName}`, timestamp: Date.now(), toolName, input: parameters };
    this.history.push(result);
    return result;
  }
  formatToolResult(toolResult) {
    return `Tool Result: ${toolResult.output}`;
  }
}
```
</details>

<details>
<summary><code>utils.js</code></summary>

```javascript
// /Users/paolobarbato/Documents/Development/mastra/utils.js
export function validateOptions(options) { return options || {}; }
export function formatError(error) { return error.message; }

export class SessionManager {
    constructor() { this.sessions = new Map(); }
    createSession() { const id = `session_${Date.now()}`; this.sessions.set(id, { id, isActive: true }); return this.sessions.get(id); }
    getSession(id) { return this.sessions.get(id); }
    endSession(id) { if(this.sessions.has(id)) this.sessions.get(id).isActive = false; }
    cleanupSession(id) { this.sessions.delete(id); }
    getAllActiveSessions() { return Array.from(this.sessions.values()).filter(s => s.isActive); }
    updateSession(id, data) { Object.assign(this.sessions.get(id), data); }
}
```
</details>

### Step 3: Use the Provider to Create an Agent

This remains the same as before.

```javascript
// /Users/paolobarbato/Documents/Development/mastra/index.js

import { createAgent } from '@mastra/core';
import { ClaudeCodeProvider } from './claude-code-provider.js';

async function main() {
  // 1. Instantiate your new provider with its configuration
  const claudeCodeProvider = new ClaudeCodeProvider({
    claudeCodeOptions: {
      // Add any default options for the Claude Code SDK here
    },
    tools: {
      // Define your tools here if they are part of the provider
    },
  });

  // 2. Create a Mastra agent, passing your provider to the `model` property.
  //    The framework now knows how to interact with your custom LLM.
  const agent = createAgent({
    model: claudeCodeProvider,
    // You can still define tools here as well
    tools: {
      // ...
    },
    // Other agent options...
  });

  console.log('Streaming response from custom Claude Code provider:');

  // 3. Use the agent as intended. Mastra handles the streaming for you.
  const result = await agent.stream({
    messages: [{ role: 'user', content: 'Tell me a short story about a robot.' }],
  });

  // The `result` object is a MastraAgentStream with all the expected utilities.
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log('\n\nStreaming finished.');
  console.log('Finish Reason:', await result.finishReason);
}

main().catch(console.error);
```

---
This refined guide provides a more accurate and robust implementation of the `ClaudeCodeProvider`, especially concerning the `doStream` method's event handling and `usage` reporting, aligning it closely with how Mastra's internal tests demonstrate provider behavior.