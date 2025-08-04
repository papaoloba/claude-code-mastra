import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { ClaudeCodeProvider } from '../../claude-code-provider.js';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Create the Claude Code provider with configuration
const claudeCodeProvider = new ClaudeCodeProvider({
  modelId: 'claude-code-assistant',
  claudeCodeOptions: {
    model: 'claude-3-5-sonnet-20241022',
    maxTurns: 10,
    permissionMode: 'default',
    cwd: process.cwd(),
    // Disable Claude Code built-in tools for safety
    disallowedTools: ['Bash', 'Write', 'Edit', 'MultiEdit'],
    appendSystemPrompt: `
You are a helpful coding assistant with deep knowledge of TypeScript, JavaScript, and modern web development.
Focus on providing clear, well-structured code examples and explanations.
When analyzing code, be thorough but concise in your explanations.
    `.trim()
  }
});

// Define custom tools for the agent
const codeAnalysisTool = createTool({
  id: 'analyze-code',
  description: 'Analyze code quality, patterns, and suggest improvements',
  inputSchema: z.object({
    code: z.string().describe('The code to analyze'),
    language: z.string().describe('Programming language (typescript, javascript, etc)'),
    focusArea: z.enum(['performance', 'security', 'readability', 'all']).optional()
      .describe('Specific area to focus the analysis on')
  }),
  outputSchema: z.object({
    language: z.string(),
    issues: z.array(z.string()),
    suggestions: z.array(z.string()),
    focusArea: z.string()
  }),
  execute: async ({ context }) => {
    // Simulate code analysis (in a real implementation, this could use AST parsing, linting, etc.)
    const issues = [];
    const suggestions = [];
    
    // Basic analysis
    if (context.code.includes('var ')) {
      issues.push('Using "var" instead of "let" or "const"');
      suggestions.push('Replace "var" with "let" or "const" for block scoping');
    }
    
    if (context.code.includes('== ') && !context.code.includes('=== ')) {
      issues.push('Using loose equality (==) instead of strict equality (===)');
      suggestions.push('Use strict equality (===) for more predictable comparisons');
    }
    
    if (context.focusArea === 'security' || context.focusArea === 'all') {
      if (context.code.includes('eval(')) {
        issues.push('Using eval() which is a security risk');
        suggestions.push('Avoid eval() and use safer alternatives');
      }
    }
    
    return {
      language: context.language,
      issues: issues.length > 0 ? issues : ['No major issues found'],
      suggestions: suggestions.length > 0 ? suggestions : ['Code looks good!'],
      focusArea: context.focusArea || 'all'
    };
  }
});

const generateTestTool = createTool({
  id: 'generate-tests',
  description: 'Generate unit tests for a given function or code snippet',
  inputSchema: z.object({
    code: z.string().describe('The code to generate tests for'),
    framework: z.enum(['jest', 'vitest', 'mocha']).default('vitest')
      .describe('Testing framework to use'),
    style: z.enum(['unit', 'integration', 'e2e']).default('unit')
      .describe('Type of tests to generate')
  }),
  outputSchema: z.object({
    functionName: z.string(),
    framework: z.string(),
    style: z.string(),
    testCode: z.string()
  }),
  execute: async ({ context }) => {
    // Extract function name from code (simple regex for demo)
    const functionMatch = context.code.match(/function\s+(\w+)|const\s+(\w+)\s*=/);
    const functionName = functionMatch ? (functionMatch[1] || functionMatch[2]) : 'unknownFunction';
    
    // Generate a simple test template
    const testTemplate = context.framework === 'jest' ? `
describe('${functionName}', () => {
  it('should work correctly', () => {
    // TODO: Add test implementation
    expect(${functionName}()).toBeDefined();
  });
  
  it('should handle edge cases', () => {
    // TODO: Add edge case tests
  });
});`.trim() : `
import { describe, it, expect } from '${context.framework}';

describe('${functionName}', () => {
  it('should work correctly', () => {
    // TODO: Add test implementation
    expect(${functionName}()).toBeDefined();
  });
  
  it('should handle edge cases', () => {
    // TODO: Add edge case tests
  });
});`.trim();
    
    return {
      functionName,
      framework: context.framework,
      style: context.style,
      testCode: testTemplate
    };
  }
});

// Create the code assistant agent
export const codeAssistant = new Agent({
  name: 'Code Assistant',
  description: 'An AI assistant specialized in code analysis, generation, and best practices',
  model: claudeCodeProvider,
  instructions: `
You are an expert coding assistant powered by Claude Code SDK. Your primary responsibilities are:

1. **Code Analysis**: Analyze code for quality, performance, security, and maintainability
2. **Code Generation**: Generate clean, well-documented code following best practices
3. **Problem Solving**: Help debug issues and suggest optimal solutions
4. **Best Practices**: Recommend modern patterns and conventions
5. **Learning Support**: Explain concepts clearly with examples

When using tools:
- Use 'analyze-code' to perform detailed code analysis
- Use 'generate-tests' to create test cases for code snippets

Always:
- Provide clear, concise explanations
- Include code examples when relevant
- Suggest improvements and alternatives
- Follow TypeScript/JavaScript best practices
- Consider performance and security implications
  `.trim(),
  tools: {
    codeAnalysisTool,
    generateTestTool
  },
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db', // path is relative to the .mastra/output directory
    }),
  }),
});

// Example function to demonstrate agent usage
export async function runCodeAssistantExample() {
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