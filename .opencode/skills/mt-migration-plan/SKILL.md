---
name: mt-migration-plan
description: 既存の単一テナント Misskey インスタンスから、既存の Host / ドメイン情報を活用したマルチテナント構成へ移行する計画を策定するための手順書。データマイグレーション、ドメイン解決設計、ロールバック計画のテンプレートを提供する。
---

## マイグレーション計画策定スキル

このスキルは、既存の単一テナント Misskey インスタンスを、既存の `host` / ドメイン関連情報を活用したマルチテナント構成へ移行するための計画策定を支援します。

## 重要ルール

- **ユーザーへの質問は必ず question ツールを使用してください。** テキストで質問を投げかけてはいけません。

## マイグレーションフェーズ

### Phase 0: 準備
1. 既存DBのバックアップ戦略
2. テナント管理テーブルの作成
3. 既定ドメイン / デフォルトテナント設定の作成
4. 既存 `host` カラムの意味と利用箇所の棚卸し
5. 管理下 host 一覧と外部連合 host の判定ルール設計

### Phase 1: スキーマ変更
1. Host / domain 解決に必要な管理テーブルや設定カラムを追加
2. 既存 `host` 列の運用ルールを整理し、必要なら管理用の補助構造を追加
3. 既存レコードに既定ドメイン / ホスト情報を付与
4. host / domain ベースの検索に必要な複合インデックスを作成

### Phase 2: アプリケーション変更
1. テナント解決ミドルウェアの実装
2. リポジトリ/サービス層の Host / domain 条件追加
3. API エンドポイントのテナントコンテキスト対応

### Phase 3: データ移行
1. 既存データの既定ドメイン / ホストへの紐付け
2. テナント分割が必要な場合のデータ分離手順
3. ファイルストレージのテナント分離

### Phase 4: 検証
1. テナント分離の完全性テスト
2. パフォーマンステスト
3. セキュリティテスト

## マイグレーションSQL テンプレート

```sql
-- Phase 0: テナント管理テーブル
CREATE TABLE "tenant" (
  "id" varchar(32) PRIMARY KEY,
  "name" varchar(256) NOT NULL,
  "slug" varchar(128) NOT NULL UNIQUE,
  "customDomain" varchar(256) UNIQUE,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "isActive" boolean NOT NULL DEFAULT true,
  "config" jsonb NOT NULL DEFAULT '{}'
);

-- Phase 1: ホスト / ドメイン管理列の追加例
ALTER TABLE "tenant" ADD COLUMN "defaultHost" varchar(256);

-- Phase 1: 既存データに既定 host を付与する補助テーブル例
CREATE TABLE "tenant_host_mapping" (
  "id" varchar(32) PRIMARY KEY,
  "tenantId" varchar(32) NOT NULL REFERENCES "tenant"("id"),
  "host" varchar(256) NOT NULL UNIQUE,
  "isPrimary" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

-- Phase 1: host ベース検索用インデックス例
CREATE INDEX "IDX_user_host_username" ON "user" ("host", "usernameLower");
CREATE INDEX "IDX_note_userHost_createdAt" ON "note" ("userHost", "createdAt");
```

## ロールバック計画テンプレート

各フェーズでのロールバック手順:

1. **スキーマ変更のロールバック**
   - 追加した host / domain 管理列の削除
   - 外部キー制約の削除
   - インデックスの削除

2. **アプリケーション変更のロールバック**
   - テナントミドルウェアの無効化
   - テナントフィルタの除去
   - 単一テナントモードへの切り替え

3. **完全ロールバック**
   - DBバックアップからの復元
   - アプリケーションのリバートデプロイ

## チェックリスト

- [ ] 既存DBのフルバックアップ取得
- [ ] テナント管理テーブルの作成完了
- [ ] デフォルトテナント / 既定ドメイン設定の作成完了
- [ ] 既存 host 列の意味整理完了
- [ ] 管理下 host と外部 host の判定ルール定義完了
- [ ] host / domain 管理用の補助構造作成完了
- [ ] 既存データへの既定 host / domain 紐付け完了
- [ ] インデックスの作成
- [ ] アプリケーションのテナント対応完了
- [ ] テナント分離テストの通過
- [ ] パフォーマンステストの通過
- [ ] セキュリティテストの通過
