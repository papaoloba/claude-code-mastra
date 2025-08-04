// Example usage of the Code Assistant agent with Claude Code Provider
import { codeAssistant } from '../src/mastra/agents/code-assistant.js';

async function main() {
  console.log('🤖 Code Assistant Example\n');
  
  // Example 1: Code analysis
  console.log('1️⃣ Analyzing code quality...\n');
  
  const analysisResult = await codeAssistant.generate([
    {
      role: 'user',
      content: `Please analyze this TypeScript function for improvements:

\`\`\`typescript
var calculateTotal = function(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].price != null && items[i].quantity != null) {
      total = total + items[i].price * items[i].quantity;
    }
  }
  return total;
}
\`\`\`

Focus on TypeScript best practices and potential improvements.`
    }
  ]);
  
  console.log('Analysis Result:', analysisResult.text);
  console.log('\n---\n');
  
  // Example 2: Test generation
  console.log('2️⃣ Generating tests...\n');
  
  const testResult = await codeAssistant.generate([
    {
      role: 'user',
      content: `Generate comprehensive tests for this function:

\`\`\`typescript
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
\`\`\`

Use Vitest framework and include edge cases.`
    }
  ]);
  
  console.log('Generated Tests:', testResult.text);
  console.log('\n---\n');
  
  // Example 3: Streaming response
  console.log('3️⃣ Streaming code explanation...\n');
  
  const stream = await codeAssistant.stream([
    {
      role: 'user',
      content: 'Explain the concept of closures in JavaScript with a practical example.'
    }
  ]);
  
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  
  console.log('\n\n✅ Code Assistant demo complete!');
  
  // Show usage stats
  console.log('\n📊 Usage Statistics:');
  console.log('- Usage:', stream.usage);
  console.log('- Tool Calls:', await stream.toolCalls);
}

// Run the example
main().catch(console.error);