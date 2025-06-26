# Claude Code × Mastra Agent統合

Claude CodeのTypeScript SDKを使用して、Mastraフレームワーク内でClaude CodeをAgentとして統合する実装です。

## 概要

このライブラリは、Claude CodeのSDKをMastra Agentインターフェースに適合させ、Mastraフレームワーク内でClaude Codeの強力なコーディング支援機能を活用できるようにします。

## 特徴

- **Mastra Agent互換**: Mastra FrameworkのAgentインターフェースに完全準拠
- **ストリーミング対応**: リアルタイムレスポンス処理
- **セッション管理**: セッション状態の追跡とリソース管理
- **エラーハンドリング**: 堅牢なエラー処理機構
- **設定可能**: Claude Code固有のオプション設定
- **型安全**: 完全なTypeScript型定義

## インストール

```bash
npm install @anthropic-ai/claude-code @mastra/core
```

## 基本的な使用方法

### シンプルな生成

```typescript
import { ClaudeCodeAgent } from './claude-code-agent.js';

const agent = new ClaudeCodeAgent({
  maxTurns: 3,
  permissionMode: 'default'
});

const response = await agent.generate(
  'Write a TypeScript function to calculate fibonacci numbers'
);

console.log(response.content);
console.log(response.metadata); // セッション情報、コスト等
```

### ストリーミング処理

```typescript
for await (const chunk of agent.stream('Create a REST API with Express.js')) {
  if (chunk.type === 'content') {
    console.log('Content:', chunk.data.content);
  } else if (chunk.type === 'complete') {
    console.log('Total cost:', chunk.data.totalCost);
  }
}
```

## 設定オプション

```typescript
interface ClaudeCodeAgentOptions {
  maxTurns?: number;                    // 最大ターン数 (デフォルト: 10)
  allowedTools?: string[];              // 許可されるツール
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
  workingDirectory?: string;            // 作業ディレクトリ
  timeout?: number;                     // タイムアウト (ms, デフォルト: 300000)
}
```

## API

### ClaudeCodeAgent

#### constructor(options?: ClaudeCodeAgentOptions)
新しいエージェントインスタンスを作成します。

#### generate(prompt: string, options?: Partial<ClaudeCodeAgentOptions>): Promise<MastraResponse>
単一のレスポンスを生成します。

#### stream(prompt: string, options?: Partial<ClaudeCodeAgentOptions>): AsyncIterable<MastraStreamChunk>
ストリーミングレスポンスを生成します。

#### getSessionInfo(sessionId: string): SessionInfo | undefined
セッション情報を取得します。

#### getAllActiveSessions(): SessionInfo[]
アクティブなセッション一覧を取得します。

#### updateDefaultOptions(options: Partial<ClaudeCodeAgentOptions>): void
デフォルトオプションを更新します。

## レスポンス形式

### MastraResponse

```typescript
interface MastraResponse {
  content: string;
  metadata?: {
    sessionId?: string;
    cost?: number;
    duration?: number;
    totalTurns?: number;
  };
}
```

### MastraStreamChunk

```typescript
interface MastraStreamChunk {
  type: 'content' | 'metadata' | 'error' | 'complete';
  data: any;
}
```

## セッション管理

エージェントは自動的にセッションを管理し、以下の機能を提供します：

- **自動セッション作成**: 各クエリで新しいセッションを作成
- **コスト追跡**: 実行コストの追跡
- **リソース管理**: 30秒後の自動クリーンアップ
- **セッション情報**: アクティブセッションの監視

## エラーハンドリング

```typescript
try {
  const response = await agent.generate('invalid request');
} catch (error) {
  console.error('Generation failed:', error.message);
}

// ストリーミングでのエラー処理
for await (const chunk of agent.stream('prompt')) {
  if (chunk.type === 'error') {
    console.error('Stream error:', chunk.data.error);
    break;
  }
}
```

## 高度な使用例

### 設定の動的更新

```typescript
const agent = new ClaudeCodeAgent();

// デフォルト設定を更新
agent.updateDefaultOptions({
  maxTurns: 5,
  allowedTools: ['Edit', 'Read', 'Write'],
  permissionMode: 'bypassPermissions'
});

// 特定のクエリでオプションをオーバーライド
const response = await agent.generate('prompt', {
  maxTurns: 1,
  timeout: 30000
});
```

### セッション監視

```typescript
// アクティブセッションの監視
console.log('Active sessions:', agent.getAllActiveSessions().length);

// 特定セッションの情報取得
const sessionInfo = agent.getSessionInfo(sessionId);
if (sessionInfo) {
  console.log('Session cost:', sessionInfo.totalCost);
  console.log('Session duration:', Date.now() - sessionInfo.startTime);
}
```

## ファイル構成

- `claude-code-agent.ts` - メインのClaudeCodeAgentクラス
- `message-converter.ts` - メッセージ変換ユーティリティ
- `types.ts` - TypeScript型定義
- `utils.ts` - ヘルパー関数とセッション管理
- `example.ts` - 使用例とデモコード

## 要件

- Node.js 18+
- TypeScript 4.9+
- `@anthropic-ai/claude-code` ^1.0.35
- `@mastra/core` ^0.10.8

## 認証

Claude Codeの認証設定が必要です：

```bash
# Claude Codeにログイン
claude login

# または環境変数で設定
export ANTHROPIC_API_KEY=your_api_key
```

## テスト

このプロジェクトは包括的なテストスイートを含んでいます：

### テストの種類

#### ユニットテスト
```bash
npm run test:unit
```
個別のコンポーネントとメソッドをテストします（モック使用）。

#### コンポーネント統合テスト
```bash
npm run test:integration
```
各コンポーネント間の統合をテストします（モック使用）。

#### E2Eテスト
```bash
npm run test:e2e
```
実際のClaude Code SDKとの統合をテストします（実際のAPI呼び出し）。

⚠️ **注意**: E2Eテストには以下が必要です：
- Claude Code CLIの設定: `claude login`
- 有効なAnthropic APIキー
- インターネット接続
- APIクレジット消費の可能性

#### 全テスト
```bash
npm run test        # E2Eを除く全テスト
npm run test:all    # 全テストを実行
npm run test:watch  # ウォッチモード
npm run test:ui     # UI付きテスト
npm run test:coverage # カバレッジ付きテスト
```

### テスト結果

- **73個のユニット・統合テスト**
- **9個のE2Eテスト**
- **完全なカバレッジ**: 全主要機能をカバー
- **パフォーマンステスト**: レスポンス時間とコンカレンシー
- **エラーハンドリングテスト**: 異常系の動作確認

## 開発

```bash
# 開発時の型チェック
npm run typecheck

# ビルド
npm run build

# ウォッチモードでテスト
npm run test:watch
```

## ライセンス

ISC

## 作者

Takahito Mita