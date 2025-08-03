#!/usr/bin/env tsx

import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';

// Mock the Claude Code SDK
const mockMessages = [
  {
    type: 'assistant' as const,
    message: {
      content: 'Hello! I can help you with software engineering tasks. Let me know what you\'d like to work on.',
      type: 'assistant' as const,
      role: 'assistant' as const
    },
    session_id: 'test-session',
    parent_tool_use_id: null
  },
  {
    type: 'result' as const,
    subtype: 'success' as const,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 1,
    session_id: 'test-session',
    total_cost_usd: 0.01,
    usage: { input_tokens: 10, output_tokens: 20 },
    result: 'Final result'
  }
];

// Create agent
const agent = new ClaudeCodeAgent({
  name: 'test-agent',
  instructions: 'Test instructions',
  model: 'claude-3-5-sonnet-20241022'
});

console.log('Testing agent response format...\n');

// Simulate what the generate method returns
const mockResponse = {
  text: "Hello! I can help you with software engineering tasks. Let me know what you'd like to work on.",
  toolCalls: [],
  toolResults: [],
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  finishReason: 'stop' as const,
  reasoning: undefined,
  files: [],
  reasoningDetails: [],
  sources: [],
  experimental_output: undefined,
  warnings: undefined,
  experimental_providerMetadata: {
    sessionId: 'session_1754247338879_lfa9doum9',
    cost: 0.09495424999999999,
    duration: 4331
  }
};

console.log('Mock response structure:');
console.log(JSON.stringify(mockResponse, null, 2));

console.log('\nChecking response properties:');
console.log('- Has text:', 'text' in mockResponse && typeof mockResponse.text === 'string');
console.log('- Text length:', mockResponse.text.length);
console.log('- Has toolCalls:', Array.isArray(mockResponse.toolCalls));
console.log('- Has finishReason:', mockResponse.finishReason === 'stop');

// Test serialization
console.log('\nTesting JSON serialization:');
try {
  const serialized = JSON.stringify(mockResponse);
  const deserialized = JSON.parse(serialized);
  console.log('✓ Response can be serialized and deserialized');
  console.log('✓ Deserialized text:', deserialized.text);
} catch (error) {
  console.error('✗ Serialization error:', error);
}

// Test what Mastra might expect
console.log('\nTesting Mastra compatibility:');
console.log('- Response is object:', typeof mockResponse === 'object');
console.log('- Response is not null:', mockResponse !== null);
console.log('- Response.text is accessible:', mockResponse.text);

process.exit(0);