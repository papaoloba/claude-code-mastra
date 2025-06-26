# ローカルnpmパッケージとしての使用方法

このパッケージをローカル環境でnpmパッケージとして利用する方法を説明します。

## セットアップ手順

### 1. パッケージのビルド
```bash
cd /home/t3ta/workspace/claude-code-mastra
npm run build
```

### 2. ローカルリンクの作成
```bash
npm link
```

### 3. 他のプロジェクトでの使用
```bash
# 他のプロジェクトディレクトリで
npm link claude-code-mastra
```

## 使用例

### 基本的なインポート
```typescript
import { ClaudeCodeAgent } from 'claude-code-mastra';

const agent = new ClaudeCodeAgent({
  maxTurns: 3,
  permissionMode: 'default'
});

const response = await agent.generate('Hello world');
console.log(response.content);
```

### 型定義の使用
```typescript
import { 
  ClaudeCodeAgent, 
  type ClaudeCodeAgentOptions,
  type MastraResponse 
} from 'claude-code-mastra';

const options: ClaudeCodeAgentOptions = {
  maxTurns: 5,
  timeout: 30000
};

const agent = new ClaudeCodeAgent(options);
const response: MastraResponse = await agent.generate('Create a simple function');
```

### ストリーミング
```typescript
import { ClaudeCodeAgent } from 'claude-code-mastra';

const agent = new ClaudeCodeAgent();

for await (const chunk of agent.stream('Write a TypeScript function')) {
  if (chunk.type === 'content') {
    console.log(chunk.data.content);
  }
}
```

## ユーティリティクラスの使用

### MessageConverter
```typescript
import { MessageConverter } from 'claude-code-mastra';

const converter = new MessageConverter();
// メッセージ変換処理
```

### SessionManager
```typescript
import { SessionManager } from 'claude-code-mastra';

const sessionManager = new SessionManager();
const sessionId = sessionManager.createSession();
```

## パッケージの更新

変更を行った場合は再ビルドが必要です：

```bash
npm run build
```

## パッケージのアンリンク

リンクを解除する場合：

```bash
# 他のプロジェクトで
npm unlink claude-code-mastra

# このプロジェクトで
npm unlink
```

## 注意事項

- パッケージを変更した場合は `npm run build` を実行してください
- TypeScript型定義も自動的に生成されます（`dist/index.d.ts`）
- ES Moduleとして設計されているため、`import`文を使用してください