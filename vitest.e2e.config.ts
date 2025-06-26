import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.e2e.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 60000, // 60秒タイムアウト（実際のAPI呼び出しのため）
    hookTimeout: 30000,
    pool: 'forks', // E2Eテストは独立したプロセスで実行
    poolOptions: {
      forks: {
        singleFork: true // 一つずつ実行してリソース競合を避ける
      }
    },
    // E2Eテスト専用の環境変数設定
    env: {
      NODE_ENV: 'test',
      CLAUDE_CODE_E2E_TEST: 'true'
    },
    // レポーター設定
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './test-results/e2e-results.json'
    }
  },
  resolve: {
    alias: {
      '@': new URL('./', import.meta.url).pathname
    }
  }
});