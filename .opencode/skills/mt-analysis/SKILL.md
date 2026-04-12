---
name: mt-analysis
description: Misskey (type4ny) プロジェクトのマルチテナント分析を行うための共通手順とガイドライン。既存の Host / ドメイン関連情報の再利用を前提に、分析エージェントが参照する共通コンテキスト情報を提供する。
---

## マルチテナント分析共通ガイドライン

このスキルは、マルチテナント分析エージェント群が参照する共通のコンテキスト情報と分析ガイドラインです。

## 重要ルール

- **ユーザーへの質問は必ず question ツールを使用してください。** テキストで質問を投げかけてはいけません。

## プロジェクト構造

```
packages/
  backend/          # Nest.js ベースのバックエンド
    src/
      config.ts     # サーバー設定（host, url 等）
      models/       # TypeORM エンティティ定義
      server/
        api/
          endpoints/ # API エンドポイント
        api/stream/
          channels/  # ストリーミングチャンネル
      core/         # コアサービス（EntityService, Cache 等）
      queue/        # Bull キュー処理
      migration/    # DBマイグレーション
  frontend/         # Vue.js フロントエンド
    src/
      config.ts     # フロントエンド設定
      instance.ts   # インスタンス情報
  frontend-shared/  # 共有フロントエンドコンポーネント
  frontend-embed/   # 埋め込みフロントエンド
  shared/           # バックエンド・フロントエンド共有コード
  misskey-js/       # Misskey API クライアントライブラリ
  sw/               # Service Worker
```

## マルチテナント仕様

### 分離方式
- **Host ベース分離**: 同一 PostgreSQL DB 内で、既存の `host` カラムを活用して論理分離
- 新しい `tenantId` カラムの追加は行わない
- 連合(federation)とローカルテナントは同じ `host` 概念で扱う
- 「管理下テナント host」と「外部連合 host」を判定する `isManagedHost()` 層を導入

### テナント識別
- **サブドメイン方式**: `{slug}.example.com` → テナント解決
- **カスタムドメイン方式**: `custom-domain.com` → tenant_host_mapping で解決
- バックエンドでは HTTP `Host` ヘッダーからテナントを解決

### 最重要課題: host == null の差し替え

現状のコードでは `host == null` が「ローカルユーザー」を意味する箇所が非常に多い:

```typescript
// 現在のパターン（全て差し替え対象）
user.host == null          // → ローカルユーザー判定
user.host === null         // → ローカルユーザー判定
host: IsNull()             // → TypeORM の WHERE host IS NULL
"userHost" IS NULL         // → 生 SQL
isLocalUser(user)          // → user.host == null のラッパー
isRemoteUser(user)         // → user.host != null のラッパー
```

マルチテナント化後は各テナントの host が non-null になるため、これらを全て `isManagedHost(host)` 系の判定に差し替える必要がある。

### 既知の主要影響箇所

| ファイル | 行 | 内容 |
|---|---|---|
| `UserEntityService.ts` | 61 | `isLocalUser(user) => user.host == null` |
| `local-timeline.ts` | 57 | `note.user.host !== null` で弾く |
| `notes/local-timeline.ts` | 153 | `note.userHost IS NULL` |
| `username/available.ts` | 52 | `host: IsNull()` |
| `request-reset-password.ts` | 64 | `host: IsNull()` |
| `users.ts` | 66 | `host IS NULL / IS NOT NULL` |

### テナント解決フロー

```
HTTP Request
  → Host ヘッダー取得
  → サブドメイン or カスタムドメイン判定
  → tenant_host_mapping テーブルで管理下 host か確認
  → isManagedHost(host) = true → テナントコンテキスト注入
  → isManagedHost(host) = false → 外部連合 host として処理
```

## 分析時の注意事項

1. **連合 (Federation)**: 各テナントが独立したドメインとして連合に参加。マルチテナント同士も連合関係。
2. **元 type4ny ソース**: `~/Coding/Type4ny` にある。参考にするが最新版に合わせる。
3. **パフォーマンス**: host ベース分離ではインデックス再設計が必要になる可能性がある。
4. **後方互換性**: 既存の単一テナント環境から段階的に移行可能な設計とする。
