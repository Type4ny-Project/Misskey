# Type4ny 機能実装計画

このドキュメントでは、Type4ny の機能を misskey-typeany に実装する計画をまとめます。

## 実装フェーズ

コア機能優先の方針に基づき、依存関係を考慮して以下のフェーズで実装を進めます。

---

## Phase 1: 基盤機能 (ポイントシステム) (END)

ログインボーナスやポイント送金の基盤となるポイントシステムを最初に実装します。

### 1.1 ログインボーナス機能

**概要**: ユーザーが毎日ログインするとポイントを獲得できる機能

**実装タスク**:

| # | タスク | ファイル | 詳細 |
|---|--------|----------|------|
| 1 | User エンティティに `getPoints` カラム追加 | `packages/backend/src/models/User.ts` | `integer`, default: 0 |
| 2 | UserProfile に `loggedInDates` カラム追加 | `packages/backend/src/models/UserProfile.ts` | `varchar[]`, ログイン日付の配列 |
| 3 | UserProfile に `loginBonusIsVisible` カラム追加 | `packages/backend/src/models/UserProfile.ts` | `boolean`, ポイント公開設定 |
| 4 | Meta に `enableLoginBonus` 設定追加 | `packages/backend/src/models/Meta.ts` | サーバー全体のON/OFF設定 |
| 5 | 通知タイプ `loginBonus` 追加 | `packages/backend/src/models/Notification.ts` | 通知モデルの拡張 |
| 6 | ログインボーナス付与ロジック実装 | `packages/backend/src/server/api/endpoints/i.ts` | ログイン時にポイント付与 |
| 7 | ロールポリシーに `loginBonusGrantEnabled` 追加 | `packages/backend/src/core/RoleService.ts` | ロールでボーナス有効/無効を制御 |
| 8 | セキュアな乱数生成関数追加 | `packages/backend/src/misc/` | 1-5のランダムポイント生成 |
| 9 | DBマイグレーション作成 | `packages/backend/migration/` | 上記カラム追加用 |

### 1.2 ポイント送金機能

**概要**: ユーザー間でポイントを譲渡できる機能

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | `POST /api/point/send` エンドポイント作成 | `packages/backend/src/server/api/endpoints/point/send.ts` |
| 2 | ポイント送金サービス作成 | `packages/backend/src/core/PointService.ts` |
| 3 | misskey-js に型定義追加 | `packages/misskey-js/src/` |

### 1.3 管理者ポイント付与

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | `POST /api/admin/accounts/present-points` 作成 | `packages/backend/src/server/api/endpoints/admin/accounts/present-points.ts` |

---

## Phase 2: ノート関連機能 (COMPLETED)

### 2.1 ノート編集機能

**概要**: 投稿済みノートを編集できる機能 Activity Pubを考慮しなければならない。

**実装タスク**:

| # | タスク | ファイル | 詳細 |
|---|--------|----------|------|
| 1 | Note に `updatedAt` カラム追加 | `packages/backend/src/models/Note.ts` | `timestamp with time zone`, nullable |
| 2 | Note に `updatedAtHistory` カラム追加 | `packages/backend/src/models/Note.ts` | `timestamp[]`, 編集履歴日時 |
| 3 | Note に `noteEditHistory` カラム追加 | `packages/backend/src/models/Note.ts` | `varchar[]`, 編集前テキスト履歴 |
| 4 | NoteUpdateService 作成 | `packages/backend/src/core/NoteUpdateService.ts` | ノート更新ロジック |
| 5 | `POST /api/notes/update` エンドポイント作成 | `packages/backend/src/server/api/endpoints/notes/update.ts` | |
| 6 | DBマイグレーション作成 | `packages/backend/migration/` | |

---

## Phase 3: チャンネル拡張 (COMPLETED)

### 3.1 チャンネル共同管理者・所有権譲渡

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | Channel に `collaboratorIds` カラム追加 | `packages/backend/src/models/Channel.ts` |
| 2 | `channels/update` に共同管理者設定追加 | `packages/backend/src/server/api/endpoints/channels/update.ts` |
| 3 | `channels/transfer` エンドポイント作成 | `packages/backend/src/server/api/endpoints/channels/transfer.ts` |
| 4 | 共同管理者権限チェックロジック追加 | `packages/backend/src/core/ChannelService.ts` |
| 5 | DBマイグレーション作成 | `packages/backend/migration/` |

---

## Phase 4: 絵文字申請機能 (COMPLETED)

**概要**: ユーザーがカスタム絵文字の追加を申請できる機能

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | EmojiRequest エンティティ作成 | `packages/backend/src/models/EmojiRequest.ts` |
| 2 | `POST /api/emoji-request` (申請作成) | `packages/backend/src/server/api/endpoints/emoji-request/create.ts` |
| 3 | `GET /api/emoji-requests` (申請一覧) | `packages/backend/src/server/api/endpoints/emoji-requests.ts` |
| 4 | `POST /api/admin/emoji/approve-request` | `packages/backend/src/server/api/endpoints/admin/emoji/approve-request.ts` |
| 5 | `POST /api/admin/emoji/reject-request` | `packages/backend/src/server/api/endpoints/admin/emoji/reject-request.ts` |
| 6 | `POST /api/admin/emoji/list-request` | `packages/backend/src/server/api/endpoints/admin/emoji/list-request.ts` |
| 7 | EmojiRequestService 作成 | `packages/backend/src/core/EmojiRequestService.ts` |
| 8 | DBマイグレーション作成 | `packages/backend/migration/` |

---

## Phase 5: マネージドサーバー機能

**概要**: 商用ホスティング向けの設定固定化・制限モード

**実装タスク**:

| # | タスク | ファイル | 詳細 |
|---|--------|----------|------|
| 1 | `MANAGED` 環境変数対応 | `packages/backend/src/env.ts` | 環境変数の読み取り |
| 2 | `start-managed` スクリプト追加 | `package.json` | `MANAGED=true npm run start` |
| 3 | Meta 更新時の固定化チェック | `packages/backend/src/core/MetaService.ts` | MANAGEDモード時は特定項目を変更不可に |
| 4 | 管理者APIレスポンスのマスク処理 | `packages/backend/src/core/entities/MetaEntityService.ts` | シークレット情報の隠蔽 |
| 5 | ユーザー数上限チェック | `packages/backend/src/server/api/endpoints/signup.ts` | `maxLocalUsers` 制限 |
| 6 | Config に `maxLocalUsers` 追加 | `packages/backend/src/config.ts` | 設定ファイル対応 |

---

## Phase 6: タイムライン拡張

### 6.1 仮想ローカルタイムライン (Remote Local Timeline)

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | `notes/any-local-timeline` エンドポイント | `packages/backend/src/server/api/endpoints/notes/any-local-timeline.ts` |
| 2 | フロントエンドにカラム追加 | `packages/frontend/src/` |

---

## Phase 7: 管理・モデレーション機能

### 7.1 Inbox詳細モデレーション

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | InboxRule エンティティ作成 | `packages/backend/src/models/InboxRule.ts` |
| 2 | InboxRuleService 作成 | `packages/backend/src/core/InboxRuleService.ts` |
| 3 | InboxProcessor にルール適用 | `packages/backend/src/queue/processors/InboxProcessorService.ts` |
| 4 | 管理者API作成 | `packages/backend/src/server/api/endpoints/admin/inbox-rules/` |

### 7.2 プロモーション機能

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | Promo エンティティ作成 | `packages/backend/src/models/Promo.ts` |
| 2 | PromoService 作成 | `packages/backend/src/core/PromoService.ts` |
| 3 | 管理者API作成 | `packages/backend/src/server/api/endpoints/admin/promo/` |

### 7.3 絵文字安全性チェック

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | `emoji/speedtest` エンドポイント | `packages/backend/src/server/api/endpoints/emoji/speedtest.ts` |
| 2 | アニメーション解析ロジック | `packages/backend/src/core/EmojiSafetyService.ts` |

### 7.4 捨てメアド・VPN検出

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | Meta に設定項目追加 | `packages/backend/src/models/Meta.ts` |
| 2 | Verifymail/Truemail 連携 | `packages/backend/src/core/EmailValidationService.ts` |
| 3 | ProxyCheck.io 連携 | `packages/backend/src/core/ProxyCheckService.ts` |
| 4 | signup 時のチェック追加 | `packages/backend/src/server/api/endpoints/signup.ts` |

---

## Phase 8: クライアント UI機能

### 8.1 絵文字ピッカープロファイル

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | ユーザーレジストリにプロファイル保存 | フロントエンド |
| 2 | 絵文字ピッカーにタブUI追加 | `packages/frontend/src/components/MkEmojiPicker.vue` |
| 3 | 設定画面にプロファイル管理追加 | `packages/frontend/src/pages/settings/` |

### 8.2 ゲーミングモード

**実装タスク**:

| # | タスク | ファイル |
|---|--------|----------|
| 1 | CSSアニメーション追加 | `packages/frontend/src/style.scss` |
| 2 | 設定項目追加 | `packages/frontend/src/store/` |
| 3 | 各コンポーネントにクラス適用 | 複数ファイル |

### 8.3 その他UI機能

| 機能 | 優先度 | 詳細 |
|------|--------|------|
| 下書き複数保存 | 中 | localStorageまたはレジストリ |
| ノート背景色 | 低 | 公開範囲に応じた色分け |
| ワードミュート拡張 | 中 | ユーザー個別設定 |
| リアクションミュート | 中 | 特定リアクション非表示 |
| About Type4ny ページ | 低 | 開発者・貢献者表示 |
| ミニゲーム | 低 | Bubble Game, Clicker |

---

## DBマイグレーション一覧

| Phase | マイグレーション名 | 内容 |
|-------|-------------------|------|
| 1 | AddLoginBonusColumns | User.getPoints, UserProfile.loggedInDates 等 |
| 2 | AddNoteEditColumns | Note.updatedAt, noteEditHistory 等 |
| 2 | CreateScheduledNoteTable | note_schedule テーブル |
| 3 | AddChannelCollaborators | Channel.collaboratorIds |
| 4 | CreateEmojiRequestTable | emoji_request テーブル |
| 7 | CreateInboxRulesTable | inbox_rules テーブル |
| 7 | CreatePromoTable | promo テーブル |

---

## 実装順序の理由

1. **Phase 1 (ポイントシステム)**: 他機能の基盤となるユーザーテーブル拡張を最初に
2. **Phase 2 (ノート関連)**: コアユースケースであるノート機能の拡張
3. **Phase 3 (チャンネル)**: 既存機能の拡張なので比較的独立
4. **Phase 4 (絵文字申請)**: 新規テーブル・独立機能
5. **Phase 5 (マネージド)**: サーバー運用に関わる重要機能
6. **Phase 6 (タイムライン)**: ユーザー体験向上
7. **Phase 7 (モデレーション)**: 管理機能
8. **Phase 8 (UI)**: フロントエンドの実装

---

## 注意事項

- 各フェーズ完了後にテストを実施
- マイグレーションは本番適用前に十分なテストを行う
- フロントエンド変更は i18n (国際化) も考慮する
- misskey-js の型定義も同時に更新する

---

*このドキュメントは実装進行に伴い更新されます。*
