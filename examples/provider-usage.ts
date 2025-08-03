// Example usage of Claude Code Provider with Mastra

import { Agent } from '@mastra/core/agent';
import { ClaudeCodeProvider } from '../src/claude-code-provider.js';
import { z } from 'zod';

async function main() {
  // 1. Instantiate your new provider with its configuration
  const claudeCodeProvider = new ClaudeCodeProvider({
    modelId: 'claude-code-custom',
    claudeCodeOptions: {
      // Add any default options for the Claude Code SDK here
      model: 'claude-3-5-sonnet-20241022',
      maxTurns: 10,
      permissionMode: 'default',
      cwd: process.cwd(),
    },
    tools: {
      // Define provider-level tools if needed
    },
  });

  // 2. Create a Mastra agent, passing your provider to the `model` property.
  //    The framework now knows how to interact with your custom LLM.
  const agent = new Agent({
    model: claudeCodeProvider,
    name: 'claude-code-agent',
    instructions: 'You are a helpful coding assistant powered by Claude Code SDK.',
    // You can still define tools here as well
    tools: {
      calculator: {
        id: 'calculator',
        description: 'Perform mathematical calculations',
        inputSchema: z.object({
          expression: z.string().describe('The mathematical expression to evaluate'),
        }),
        execute: async ({ context }) => {
          try {
            // Simple eval for demo purposes - in production use a proper math library
            const result = eval(context.expression);
            return { result };
          } catch (error) {
            return { error: 'Invalid expression' };
          }
        },
      },
    },
  });

  console.log('🚀 Streaming response from custom Claude Code provider:');

  // 3. Use the agent as intended. Mastra handles the streaming for you.
  const messages = [
    { 
      role: 'user' as const, 
      content: 'Can you calculate 25 * 4 + 10 for me? Then tell me a short story about a robot learning to code.' 
    }
  ];
  
  const result = await agent.stream(messages);

  // The `result` object is a MastraAgentStream with all the expected utilities.
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log('\n\n✅ Streaming finished.');
  
  // Get the final result
  console.log('📊 Usage:', result.usage);
  console.log('🏁 Finish Reason:', result.finishReason);
  if (result.toolCalls && (await result.toolCalls).length > 0) {
    console.log('🔧 Tool Calls:', result.toolCalls);
  }
}

// Example 2: Non-streaming generation
async function exampleNonStreaming() {
  const claudeCodeProvider = new ClaudeCodeProvider({
    modelId: 'claude-code-custom',
  });

  const agent = new Agent({
    model: claudeCodeProvider,
    name: 'claude-code-agent',
    instructions: 'You are a helpful assistant.',
  });

  console.log('\n📝 Non-streaming response:');
  
  const messages = [
    { role: 'user' as const, content: 'What is TypeScript?' }
  ];
  
  const result = await agent.generate(messages);

  console.log(result.text);
  console.log('📊 Usage:', result.usage);
}

// Run examples
main()
  .then(() => exampleNonStreaming())
  .catch(console.error);