import { ClaudeCodeAgent } from '../src/claude-code-agent.js';
import type { ClaudeCodeAgentOptions } from '../src/types.js';

async function basicUsageExample() {
  console.log('=== Basic Usage Example ===');
  
  const agent = new ClaudeCodeAgent({
    name: 'claude-code-agent',
    instructions: 'You are a helpful coding assistant using Claude Code.',
    model: 'claude-3-5-sonnet-20241022',
    claudeCodeOptions: {
      maxTurns: 3,
      permissionMode: 'default',
      timeout: 60000 // 1 minute
    }
  });

  try {
    const response = await agent.generate(
      'Write a simple TypeScript function to calculate the factorial of a number'
    );
    
    console.log('Generated Response:');
    console.log(response.text);
    console.log('\nUsage:');
    console.log(JSON.stringify(response.usage, null, 2));
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function streamingExample() {
  console.log('\n=== Streaming Example ===');
  
  const agent = new ClaudeCodeAgent({
    name: 'claude-code-streaming-agent',
    instructions: 'You are a helpful coding assistant.',
    model: 'claude-3-5-sonnet-20241022',
    claudeCodeOptions: {
      maxTurns: 2,
      permissionMode: 'acceptEdits'
    }
  });

  try {
    console.log('Starting stream...');
    
    const streamResult = await agent.stream(
      'Create a simple REST API endpoint for user management using Express.js'
    );
    
    for await (const chunk of streamResult.textStream) {
      console.log('Chunk:', chunk);
    }
    
    const finalText = await streamResult.text;
    console.log('Final text length:', finalText.length);
    
    console.log('Stream completed.');
    
  } catch (error) {
    console.error('Stream error:', error instanceof Error ? error.message : error);
  }
}

async function sessionManagementExample() {
  console.log('\n=== Session Management Example ===');
  
  const agent = new ClaudeCodeAgent({
    name: 'session-demo-agent',
    instructions: 'You are a helpful assistant.',
    model: 'claude-3-5-sonnet-20241022'
  });

  console.log('Active sessions before:', agent.getAllActiveSessions().length);

  const streamResult = await agent.stream('List files in current directory');
  
  console.log('Active sessions during execution:', agent.getAllActiveSessions().length);
  
  for await (const chunk of streamResult.textStream) {
    console.log('Received chunk:', chunk.length, 'characters');
  }
  
  setTimeout(() => {
    console.log('Active sessions after completion:', agent.getAllActiveSessions().length);
  }, 1000);
}

async function errorHandlingExample() {
  console.log('\n=== Error Handling Example ===');
  
  const agent = new ClaudeCodeAgent({
    name: 'error-demo-agent',
    instructions: 'You are a helpful assistant.',
    model: 'claude-3-5-sonnet-20241022',
    claudeCodeOptions: {
      maxTurns: 1,
      timeout: 1000 // Very short timeout to trigger error
    }
  });

  try {
    await agent.generate('Write a complex web application with multiple components');
  } catch (error) {
    console.log('Expected timeout error caught:', error instanceof Error ? error.message : error);
  }

  try {
    const streamResult = await agent.stream('Invalid request that might cause issues');
    for await (const chunk of streamResult.textStream) {
      console.log('Stream chunk:', chunk);
    }
  } catch (error) {
    console.log('Stream error caught:', error instanceof Error ? error.message : error);
  }
}

async function configurationExample() {
  console.log('\n=== Configuration Example ===');
  
  const agent = new ClaudeCodeAgent({
    name: 'config-demo-agent',
    instructions: 'You are a helpful assistant.',
    model: 'claude-3-5-sonnet-20241022'
  });
  
  console.log('Default Claude Code options:', agent.getClaudeCodeOptions());
  
  agent.updateClaudeCodeOptions({
    maxTurns: 5,
    allowedTools: ['Edit', 'Read', 'Write'],
    permissionMode: 'bypassPermissions'
  });
  
  console.log('Updated Claude Code options:', agent.getClaudeCodeOptions());
  
  const response = await agent.generate(
    'Check the current directory structure',
    { maxSteps: 1 } // Override for this specific call
  );
  
  console.log('Configuration override response length:', response.text.length);
}

async function main() {
  console.log('Claude Code x Mastra Agent Integration Examples\n');
  
  try {
    await basicUsageExample();
    await streamingExample();
    await sessionManagementExample();
    await errorHandlingExample();
    await configurationExample();
    
    console.log('\n=== All Examples Completed ===');
    
  } catch (error) {
    console.error('Example execution failed:', error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  basicUsageExample,
  streamingExample,
  sessionManagementExample,
  errorHandlingExample,
  configurationExample
};