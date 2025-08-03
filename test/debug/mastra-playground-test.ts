#!/usr/bin/env tsx

import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';

async function testMastraPlayground() {
  console.log('Testing Mastra Playground compatibility...\n');

  // Create agent instance
  const agent = new ClaudeCodeAgent({
    name: 'test-agent',
    instructions: 'You are a helpful AI assistant',
    model: 'claude-3-5-sonnet-20241022'
  });

  // Test 1: Check if generate method exists
  console.log('1. Checking generate method:');
  console.log('   - Has generate:', typeof agent.generate === 'function');
  console.log('   - Method name:', agent.generate.name);

  // Test 2: Check method signature
  console.log('\n2. Checking method signature:');
  console.log('   - Length:', agent.generate.length);

  // Test 3: Mock a simple call
  console.log('\n3. Testing mock generate call:');
  
  // Mock the query function
  const mockQuery = async function* () {
    yield {
      type: 'assistant' as const,
      message: {
        content: 'Hello from mock agent!',
        type: 'assistant' as const,
        role: 'assistant' as const
      },
      session_id: 'mock-session',
      parent_tool_use_id: null
    };
    yield {
      type: 'result' as const,
      subtype: 'success' as const,
      duration_ms: 100,
      duration_api_ms: 80,
      is_error: false,
      num_turns: 1,
      session_id: 'mock-session',
      total_cost_usd: 0.001,
      usage: { input_tokens: 5, output_tokens: 10 },
      result: 'Success'
    };
  };

  // Override the query import
  const originalModule = await import('@anthropic-ai/claude-code');
  (originalModule as any).query = mockQuery;

  try {
    const result = await agent.generate('Hello');
    
    console.log('   ✓ Generate call succeeded');
    console.log('\n4. Response structure:');
    console.log('   - Type:', typeof result);
    console.log('   - Has text:', 'text' in result);
    console.log('   - Text value:', result.text);
    console.log('   - Has toolCalls:', 'toolCalls' in result);
    console.log('   - Has finishReason:', 'finishReason' in result);
    console.log('   - Has usage:', 'usage' in result);
    
    console.log('\n5. Full response (stringified):');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n6. Testing Mastra dev playground expectations:');
    // The playground likely calls toJSON or JSON.stringify
    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);
    console.log('   - Can serialize/deserialize:', !!parsed);
    console.log('   - Parsed text:', parsed.text);
    
  } catch (error) {
    console.error('   ✗ Generate call failed:', error);
  }
}

testMastraPlayground().catch(console.error);