import { ClaudeCodeAgent } from '../../src/claude-code-agent.js';
import { z } from 'zod';
import type { ToolAction } from '@mastra/core';

// デバッグ用のテストスクリプト
async function debugToolExecution() {
  console.log('🔍 Starting tool execution debug...\n');

  // テスト用のツール
  const testTools = {
    calculator: {
      description: 'Perform basic math calculations',
      inputSchema: z.object({
        expression: z.string()
      }),
      execute: async ({ context }) => {
        console.log('🔧 TOOL EXECUTED: calculator with', context);
        const result = eval(context.expression);
        return { result, expression: context.expression };
      }
    } as ToolAction,
    
    getCurrentTime: {
      description: 'Get the current date and time',
      execute: async () => {
        console.log('🔧 TOOL EXECUTED: getCurrentTime');
        const now = new Date();
        return {
          iso: now.toISOString(),
          formatted: now.toLocaleString()
        };
      }
    } as ToolAction
  };

  // エージェントを作成
  const agent = new ClaudeCodeAgent({
    name: 'debug-agent',
    instructions: 'You are a helpful assistant with access to calculator and time tools.',
    model: 'claude-3-5-sonnet-20241022',
    tools: testTools,
    claudeCodeOptions: {
      maxTurns: 2,
      timeout: 30000
    }
  });

  // ツールプロンプトを確認
  console.log('📝 Generated tools prompt:');
  console.log((agent as any).generateToolsPrompt());
  console.log('\n');

  try {
    // テスト1: シンプルな計算
    console.log('📊 Test 1: Simple calculation');
    const result1 = await agent.generate('What is 25 plus 17?');
    console.log('Response:', result1.text);
    console.log('Metadata:', result1.experimental_providerMetadata);
    console.log('\n');

    // テスト2: 時間の取得
    console.log('🕐 Test 2: Get current time');
    const result2 = await agent.generate('What time is it now?');
    console.log('Response:', result2.text);
    console.log('Metadata:', result2.experimental_providerMetadata);
    console.log('\n');

    // テスト3: 複合的なリクエスト
    console.log('🔄 Test 3: Complex request');
    const result3 = await agent.generate('Calculate 100 divided by 4 and tell me the current time');
    console.log('Response:', result3.text);
    console.log('Metadata:', result3.experimental_providerMetadata);

  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
}

// デバッグを実行
debugToolExecution().then(() => {
  console.log('\n✅ Debug completed');
}).catch(error => {
  console.error('❌ Debug failed:', error);
});