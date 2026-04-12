# MultiTenant 設計書

> 自動生成日: 2026-04-12
> 対象プロジェクト: misskey-typeany (type4ny fork)

## 1. 概要

### 1.1 目的

既存の `host` カラムと HTTP `Host` ヘッダーを活用し、単一 DB 上で Misskey を Host ベースのマルチテナント構成へ移行する。新しい `tenantId` を中心に据えるのではなく、既存の連合用 `host` 概念を再利用しつつ、管理下テナントと外部連合ホストを `isManagedHost(host)` で識別する。

### 1.2 スコープ

- バックエンドのテナント解決、認証、API、ストリーミング、ActivityPub
- `host == null` / `IsNull()` 前提のローカル判定の全面置換
- DB スキーマ・移行・インデックス再設計
- フロントエンドの「ローカル/リモート」判定見直し
- キャッシュ、Redis、Bull、ストレージ、テスト、運用への影響整理

### 1.3 前提条件

- 分離方式は **既存 `host` カラム / `Host` ヘッダーの再利用**
- テナント識別は **サブドメインまたはカスタムドメイン**
- 各テナントは **独立ドメインとして連合参加**
- 最大課題は **`host == null` に依存したローカル判定の除去**
- 既存単一テナントの主ドメインは移行時のデフォルトテナントとして扱う

## 2. 現状分析

### 2.1 関連する既存コード

#### ローカル判定の根幹

- `packages/backend/src/core/entities/UserEntityService.ts:61-69`
  - `isLocalUser(user) => user.host == null`
  - `isRemoteUser(user) => !isLocalUser(user)`
- `packages/backend/src/models/User.ts:303-306`
  - `MiLocalUser` 型が `host: null` 前提
- `packages/backend/src/core/UtilityService.ts:33-41`
  - `isSelfHost(host)` / `isUriLocal(uri)` が単一 host 前提

#### 単一 host 固定設定

- `packages/backend/src/config.ts:297-337`
  - `config.host`, `config.url`, `apiUrl`, `wsUrl`, `authUrl`, `driveUrl` を起動時に固定生成
- `packages/backend/src/config.ts:401-403`
  - Redis prefix が `host` 固定

#### API / 認証

- `packages/backend/src/server/api/AuthenticateService.ts:50-78`
  - トークン認証で host 条件なし
- `packages/backend/src/server/api/ApiCallService.ts:447-450`
  - `ep.exec(...)` にテナント情報を渡していない
- `packages/backend/src/server/api/SigninApiService.ts:85,129`
  - CORS / サインイン検索が単一 host 前提
- `packages/backend/src/server/api/SignupApiService.ts:173,201`
  - `host: IsNull()` に依存したユーザー作成

#### ストリーミング

- `packages/backend/src/server/api/stream/channels/local-timeline.ts:57`
  - `note.user.host !== null` を除外
- `packages/backend/src/server/api/stream/channels/media-timeline.ts:51`
  - 同様の null 判定
- `packages/backend/src/server/api/stream/channels/hybrid-timeline.ts:68`
  - `note.user.host == null` でローカル判定
- `packages/backend/src/core/GlobalEventService.ts:358`
  - Redis publish チャンネルが `config.host` 固定

#### ActivityPub / WebFinger / NodeInfo

- `packages/backend/src/core/activitypub/ApRendererService.ts:113-699`
  - `config.url` ベースで actor/note/activity URL を生成
- `packages/backend/src/core/activitypub/ApRequestService.ts:166,195`
  - HTTP Signature の `keyId` が `config.url` 固定
- `packages/backend/src/server/ActivityPubServerService.ts:118-129`
  - inbox の Host 検証が `request.headers.host !== this.config.host`
- `packages/backend/src/server/WellKnownServerService.ts:81-178`
  - WebFinger/host-meta が `config.host` / `config.url` 固定
- `packages/backend/src/server/NodeinfoServerService.ts:41-95`
  - NodeInfo が単一インスタンス前提

#### DB / 検索 / タイムライン

- `packages/backend/src/server/api/endpoints/notes/local-timeline.ts:153`
  - `note.userHost IS NULL`
- `packages/backend/src/server/api/endpoints/users.ts:66`
  - `user.host IS NULL`
- `packages/backend/src/server/api/endpoints/username/available.ts:52`
  - `host: IsNull()`
- `packages/backend/src/server/api/endpoints/request-reset-password.ts:64`
  - `host: IsNull()`
- `packages/backend/src/core/SearchService.ts:229`
  - 検索で `userHost IS NULL`
- `packages/backend/src/core/UserSearchService.ts:202,254,276`
  - ユーザー検索で `host IS NULL`
- `packages/backend/src/core/QueryService.ts:231,236,241,339,349`
  - 生 SQL の `userHost IS NULL` / `replyUserHost IS NULL` / `renoteUserHost IS NULL`

#### 破壊的なキュー処理

- `packages/backend/src/queue/processors/CleanRemoteFilesProcessorService.ts:38,45`
  - `userHost: Not(IsNull())` を「リモート」と判定
- `packages/backend/src/queue/processors/CleanRemoteNotesProcessorService.ts:93,96,103`
  - `userHost IS NOT NULL` を「リモート」と判定

#### フロントエンド

- `packages/frontend/src/utility/get-user-menu.ts:176-465`
  - `user.host === null` による UI 分岐
- `packages/frontend/src/components/global/MkMfm.ts:372-436`
  - MFM 表示で `host == null`
- `packages/frontend/src/components/MkInstanceTicker.vue:30-47`
  - インスタンス表示前提が単一 host 寄り
- `packages/frontend/src/pages/admin-user.vue:83-320`
  - 管理画面が `host == null` 前提

### 2.2 影響範囲サマリ

- `host == null` 系の差し替え対象は **少なくとも 148 箇所以上**（バックエンドのみ）
- `isLocalUser` / `isRemoteUser` 呼び出しは **134 箇所以上**
- `config.url` / `config.host` 参照は **114 箇所以上**
- 影響ファイルは **90〜150 ファイル規模**
- 最大リスクは **CleanRemote 系ジョブによるテナントデータ誤削除**

## 3. 設計

### 3.1 アーキテクチャ

#### 方針

1. **TenantContext を導入**し、Host ヘッダーからリクエスト単位で解決する
2. **`config.host` / `config.url` の直接参照を縮退**させ、テナント解決済み URL/host を利用する
3. ローカル判定は **`host == null` ではなく `isManagedHost(host)` / `isSameTenant(host, tenantHost)`** に置換する
4. 既存の連合 host と管理下 host を同じ `host` カラム上で扱い、**管理テーブルで意味を与える**

#### TenantContext

新規に以下を導入する。

```ts
type TenantContext = {
  tenantHost: string;
  tenantUrl: string;
  tenantId?: string;
  isPrimary: boolean;
};
```

#### テナント解決フロー

```text
HTTP Request
  → request.headers.host を取得
  → TenantResolverService.resolve(host)
  → tenant_host_mapping / デフォルト host から TenantContext 解決
  → request.tenantContext に注入
  → API / Web / ActivityPub / Streaming / OAuth / WebAuthn へ伝播
```

#### 実装入口

- `packages/backend/src/server/ServerService.ts:95-99` 付近の `onRequest` hook に Tenant 解決を追加
- `packages/backend/src/server/api/endpoint-base.ts` と `ApiCallService.ts:447-450` で `tenantContext` を伝播
- `packages/backend/src/server/api/stream/StreamingApiServerService.ts:49-62` で WS 接続時にも解決

### 3.2 データベース変更

#### 3.2.1 新規テーブル

##### tenant_host_mapping

用途: 管理下ホストの一覧とテナント解決。

想定カラム:

- `id`
- `tenantId`
- `host` (UNIQUE)
- `isPrimary`
- `createdAt`
- `updatedAt`

用途:

- `isManagedHost(host)` の参照先
- カスタムドメイン / サブドメインの正引き

##### tenant_meta

用途: 既存 `Meta` からテナント固有設定を分離。

想定カラム:

- `id`
- `host` (UNIQUE)
- `name`
- `description`
- `themeColor`
- `maintainerName`
- `disableRegistration`
- `tosUrl`
- `privacyPolicyUrl`
- `iconUrl`
- `bannerUrl`
- `manifest` 相当設定
- `createdAt`
- `updatedAt`

`Meta` はグローバルインフラ設定寄りに縮小する。

#### 3.2.2 既存テーブルの意味変更

##### host を保持する主要既存テーブル

- `User.host` — `packages/backend/src/models/User.ts:254`
- `Note.userHost/replyUserHost/renoteUserHost` — `packages/backend/src/models/Note.ts:244,257,270`
- `DriveFile.userHost` — `packages/backend/src/models/DriveFile.ts:36`
- `Emoji.host` — `packages/backend/src/models/Emoji.ts:31`
- `Poll.userHost` — `packages/backend/src/models/Poll.ts:61`
- `UserProfile.userHost` — `packages/backend/src/models/UserProfile.ts:294`
- `Following.followerHost/followeeHost` — `packages/backend/src/models/Following.ts:67,86`
- `FollowRequest.followerHost/followeeHost` — `packages/backend/src/models/FollowRequest.ts:58,76`
- `AbuseUserReport.targetUserHost/reporterHost` — `packages/backend/src/models/AbuseUserReport.ts:89,96`

#### 3.2.3 host カラム追加推奨テーブル

- `Channel`
- `Announcement`
- `Ad`
- `Relay`
- `SystemAccount`
- `Role`
- `retention_aggregation`

理由: 既存はグローバル単位だが、マルチテナントではテナント別の表示・権限・集計・通知境界が必要。

#### 3.2.4 インデックス設計

維持・活用可能:

- `user (usernameLower, host)` — テナント別 username 一意性に活用
- `emoji (name, host)` — テナント別絵文字に活用

追加推奨:

- `channel(host)`
- `announcement(host)`
- `role(host)`
- `system_account(type, host)` UNIQUE
- `tenant_host_mapping(host)` UNIQUE
- `tenant_meta(host)` UNIQUE

見直し対象:

- `note(userHost, createdAt)` 複合インデックス
- `drive_file(userHost, createdAt)`
- `following(followerHost, followeeHost)` の利用パターン見直し

#### 3.2.5 データ移行方針

1. 既存主ドメインを **primary tenant** として `tenant_host_mapping` に登録
2. 既存 `host IS NULL` のローカルユーザー/ノート/ファイル等へ **主ドメイン host を一括付与**
3. 移行期間中は `host IS NULL OR host = :tenantHost` を許容する互換レイヤーを持つ
4. 十分な検証後に `NOT NULL` 化を段階適用する

### 3.3 API 変更

#### 3.3.1 認証

`AuthenticateService` を次のように変更する。

- 現状: `authenticate(token)`
- 変更後: `authenticate(token, tenantHost)`

修正対象:

- `packages/backend/src/server/api/AuthenticateService.ts:50-78`
- `packages/backend/src/server/api/ApiCallService.ts:176,234,447-450`
- `packages/backend/src/server/api/stream/StreamingApiServerService.ts:62`

要件:

- native token / access token / session 解決に tenant 条件を追加
- キャッシュキーを `${tenantHost}:${token}` / `${tenantHost}:${userId}` 形式へ変更
- MiAuth / OAuth / passkey も tenant context 前提へ統一

#### 3.3.2 ローカル判定 API の置換

代表的置換先:

- `host: IsNull()` → `host = tenantHost`
- `user.host == null` → `isManagedHost(user.host)` または `user.host === tenantHost`
- `*Host IS NULL` → `= :tenantHost`

代表箇所:

- `packages/backend/src/server/api/endpoints/notes/local-timeline.ts:153`
- `packages/backend/src/server/api/endpoints/users.ts:66`
- `packages/backend/src/server/api/endpoints/username/available.ts:52`
- `packages/backend/src/server/api/endpoints/request-reset-password.ts:64`
- `packages/backend/src/core/QueryService.ts:231,236,241,339,349`

#### 3.3.3 ActivityPub

設計方針:

- actor/note/activity URL は **対象ユーザー/ノートの host から動的生成**
- `config.url` 直結を廃止し、`tenantUrlFor(host)` を経由する
- inbox Host 検証は `request.headers.host === config.host` ではなく `isManagedHost(request.headers.host)` に変更

重点修正箇所:

- `packages/backend/src/core/activitypub/ApRendererService.ts:113-699`
- `packages/backend/src/core/activitypub/ApRequestService.ts:166,195`
- `packages/backend/src/server/ActivityPubServerService.ts:118-129`
- `packages/backend/src/core/activitypub/ApDbResolverService.ts:68`
- `packages/backend/src/core/activitypub/models/ApPersonService.ts:236,308`

#### 3.3.4 WebFinger / NodeInfo / OAuth / WebAuthn

- `WellKnownServerService` は request host ごとに subject/template/href を生成
- `NodeinfoServerService` は tenant meta / tenant users / tenant notes 集計を返す
- `OAuth2ProviderService` は issuer を tenant URL に変更
- `WebAuthnService` は `origin` / `rpId` / `rpName` を tenant ごとに解決

### 3.4 フロントエンド変更

#### 基本方針

フロントエンドが `host == null` を見てローカル判定する構造をやめ、API 側で `isLocal` または `isManaged` 相当の情報を返す。

対象例:

- `packages/frontend/src/utility/get-user-menu.ts:176-465`
- `packages/frontend/src/components/global/MkMfm.ts:372-436`
- `packages/frontend/src/pages/admin-user.vue:83-320`
- `packages/frontend/src/components/MkInstanceTicker.vue:30-47`
- `packages/frontend/src/pages/admin/settings.vue`

対応案:

1. `host` は UI 表示用として残す
2. API レスポンスに `isLocal` / `isManaged` を追加
3. フロントエンドは null 判定ではなくそのフラグを参照
4. 管理 UI は tenant scope と global scope を明示する

### 3.5 キャッシュ・キュー・ストレージ設計

#### Redis / Cache

- `packages/backend/src/misc/cache.ts:39,44`
- `packages/backend/src/core/CacheService.ts:17-116`
- `packages/backend/src/config.ts:401-403`

方針:

- Redis prefix に tenant を入れるか、全キーへ `${tenantHost}:` を付与
- timeline / auth / user cache / meta cache を tenant 単位で分離

#### Pub/Sub / Streaming

- `packages/backend/src/core/GlobalEventService.ts:358`
- `packages/backend/src/server/api/stream/channels/*.ts`

方針:

- pub/sub channel を `tenant:${tenantHost}:...` 形式へ変更
- Channel クラスへ `tenantHost` を伝播
- local timeline は `note.user.host === tenantHost` ベースへ変更

#### Storage

- `packages/backend/src/core/InternalStorageService.ts:18,42,49`
- `packages/backend/src/core/DriveService.ts:182`

方針:

- ローカルファイル保存パスに `/{tenantHost}/` を含める
- object storage prefix に tenant host を含める
- ファイル URL 生成は tenant URL ベースにする

## 4. セキュリティ考慮

### 4.1 リスク一覧

1. **テナント横断認証**
   - `AuthenticateService.ts:50-78`
   - host 条件なしで token 解決

2. **ストリーミング漏洩**
   - `GlobalEventService.ts:358`
   - 単一 pub/sub チャンネル

3. **ActivityPub なりすまし / URL 不整合**
   - `ApRendererService.ts:113-699`
   - `ApRequestService.ts:166,195`

4. **Inbox 誤拒否 / 誤受理**
   - `ActivityPubServerService.ts:125`

5. **テナントデータ削除**
   - `CleanRemoteFilesProcessorService.ts:38,45`
   - `CleanRemoteNotesProcessorService.ts:93,96,103`

6. **Passkey 失敗 / issuer 不整合**
   - `WebAuthnService.ts:49-51`
   - `OAuth2ProviderService.ts:434`

### 4.2 対策

- 認証・セッション・トークン・キャッシュに tenant scope を導入
- `isManagedHost` と `isSameTenant` を中核 API に据える
- pub/sub、Redis key、Bull 集計キー、Storage path を tenant 分離
- ActivityPub URL と Signature keyId を tenant URL 生成へ統一
- Phase 0 で remote cleanup ジョブにガードを先行投入

## 5. 実装計画

### 5.0 最小変更方針

「全面的に `host` の意味を変える」前提で進めるが、**変更範囲は危険箇所から優先的に狭く刻んで段階導入する**。

#### 基本原則

1. **既存の `host` カラムをそのまま使う**
   - 新しい `tenantId` は導入しない
   - 既存の unique/index を最大限再利用する

2. **`config` の移行も今回の対象に含める**
   - `config.host` / `config.url` の単一値前提は解消する
   - ただし「完全に置き換える」のではなく、`TenantContext` から段階的に参照を移す
   - 旧 `config.url` / `config.host` は primary tenant / fallback 用としてのみ暫定維持してよい

3. **`host == null` は最終的に全面廃止する**
   - ローカルユーザー/ローカルノートも必ず tenant host を持つ
   - ローカル判定は `isManagedHost(host)` に統一する
   - 移行期間の互換は「一時的な migration 用コード」に限定し、設計上の正式ルールにはしない

4. **危険箇所から先に局所修正する**
   - 認証
   - remote cleanup ジョブ
   - local timeline / streaming
   - ActivityPub の Host 検証

5. **フロントエンドには新フラグを足して互換維持する**
   - `host == null` 判定を一気に直さず、API レスポンスに `isLocal` を追加して徐々に移行する

#### 最小変更で採る設計判断

##### A. ローカル判定は `isManagedHost(host)` に統一する

設計上の正式ルールは以下に固定する。

```ts
isLocalUser(user) = isManagedHost(user.host)
isRemoteUser(user) = !isManagedHost(user.host)
isSameTenant(host, tenantHost) = host === tenantHost
```

つまり:

- `host == null` はローカル判定として扱わない
- ローカルデータも全件 tenant host を持つ
- `MiLocalUser.host: null` 前提は破棄する

ただし実装順は最小変更とし、**migration 完了前だけ例外的に null を読める移行コード**を局所的に置いてよい。

##### B. `Meta` はまず分離せず、補助テーブル追加で逃がす

最小変更では `Meta` の大規模分割より、まず `tenant_meta` を追加して**テナント依存の設定だけ外出し**する。

- グローバルのままでよいもの: infra, queue, mail, object storage, federation 基本設定
- `tenant_meta` に移すもの: name, shortName, description, themeColor, icon/banner, registration, ToS/Privacy 等

##### C. `config` の移行を進めつつ、URL生成ヘルパーで段階置換する

```ts
tenantUrlFor(host: string | null): string
tenantHostFor(host: string | null): string
```

まず `tenantUrlFor(host)` / `tenantHostFor(host)` を導入し、その後 `config.url` / `config.host` の参照を高リスク箇所から置換する。

優先順位:

- ActivityPub URL 生成
- WebFinger / NodeInfo
- OAuth issuer / WebAuthn origin
- Drive file URL
- Streaming / Redis channel 名
- HTML template / manifest / frontend bootstrap 値

##### D. 認証はメソッド引数追加だけで閉じる

最小変更では `AuthenticateService.authenticate(token, tenantHost)` のように**引数1つ増やすだけ**に留める。

- request-scope provider の大量導入は避ける
- cache key だけ tenant 付きに変える
- token / session の DB 検索に host 条件を追加する

##### E. Streaming は Connection に `tenantHost` を持たせるだけにする

大きな再設計は避け、以下の局所修正に留める。

- `StreamingApiServerService` で Host 解決
- `ConnectionRequest` に `tenantHost` を追加
- `local-timeline.ts`, `media-timeline.ts`, `hybrid-timeline.ts` で `host === tenantHost` 判定へ変更
- pub/sub channel または payload に tenantHost を載せる

##### F. DB 追加は 2 テーブル + 数カラムに限定して開始する

初期実装では以下に絞る。

- 新規: `tenant_host_mapping`
- 新規: `tenant_meta`
- 追加: `system_account.host`

`channel`, `announcement`, `ad`, `relay`, `role`, `retention_aggregation` は **Phase 2 以降**へ送る。まずは「テナント解決」「認証」「TL 分離」「連合成立」を優先する。

#### 初期リリースでやらないこと

- 全グローバルテーブルへの `host` 追加
- キャッシュ基盤全体の刷新

※ ただし **`host == null` の全面廃止** と **`config.host` / `config.url` の単一値前提解消** は今回の中核変更として扱う。

#### 最小変更の実装優先順位

1. `tenant_host_mapping` と `TenantResolverService` を追加
2. primary tenant host を決め、既存 `host == null` データを埋める migration を作る
3. `AuthenticateService` に `tenantHost` を渡す
4. `CleanRemoteFiles/Notes` を `isManagedHost` ベースへ修正する
5. local timeline / streaming を `tenantHost` ベースに直す
6. `config.host` / `config.url` 参照の高リスク箇所を `TenantContext` / `tenantUrlFor()` ベースへ移す
7. ActivityPub / WebFinger の URL と Host 検証を tenant 化する
8. `tenant_meta` を追加し、Web/branding 系だけ参照を差し替える
9. 最後に null 許容コードを削除し、必要箇所を `NOT NULL` / strict 型へ進める

### 5.1 フェーズ分け

#### Phase 0: 安全弁導入

- `CleanRemoteFilesProcessorService` / `CleanRemoteNotesProcessorService` に `isManagedHost` ガード追加
- ログに `tenantHost` を出す基盤追加
- 管理下 host テーブル追加

#### Phase 1: 基盤実装

- `TenantResolverService` 実装
- `TenantContext` 導入
- `isManagedHost` / `isSameTenant` / `tenantUrlFor` ヘルパー導入
- `AuthenticateService` を tenant 対応

#### Phase 2: データ・設定分離

- `tenant_meta` 作成
- 各グローバルテーブルに `host` カラム追加
- Redis / Storage / Timeline key の tenant 化

#### Phase 3: API / ActivityPub / Streaming 移行

- `host: IsNull()` / `IS NULL` の主要 API を tenant 条件に置換
- ActivityPub URL/署名/Host 検証を tenant 化
- streaming channel と fanout timeline を tenant 化

#### Phase 4: フロントエンド / テスト / 移行完了

- フロントエンドの null 判定置換
- `host: null` 前提テスト修正
- 既存データへ primary tenant host を埋める
- 最終的な `NOT NULL` 化と互換レイヤー削除

### 5.2 ロードマップ

1. **先に壊れるものを止める**: remote cleanup / auth / redis leak
2. **次に tenant context を通す**: request → service → stream → AP
3. **その後 DB を埋める**: primary tenant host 付与
4. **最後に null 前提を消す**: 型・テスト・フロント・制約の整理

## 6. マイグレーション計画

### 6.1 データ移行手順

1. DB フルバックアップ取得
2. `tenant_host_mapping` / `tenant_meta` 作成
3. 主ドメインを default tenant として登録
4. 互換コード（`host IS NULL OR host = primaryHost`）を先にデプロイ
5. `user.host IS NULL` を primary host へバッチ更新
6. `note.userHost IS NULL` を primary host へバッチ更新
7. `drive_file`, `emoji`, `following`, `follow_request`, `user_profile`, `poll` 等を更新
8. 新規 `host` 追加テーブルの既存データへ primary host を付与
9. 検証後に `NOT NULL` 制約を段階適用

### 6.2 ロールバック

- アプリケーション: tenant resolver / tenant filter を feature flag で無効化可能にする
- DB: 大規模 UPDATE 前にスナップショットを取得する
- 制約変更: `NOT NULL` は最終段階まで遅らせる

## 7. リスクと課題

1. **`MiLocalUser` 型変更の波及が大きい**
   - `packages/backend/src/models/User.ts:303-306`
2. **巨大テーブル更新の時間とロック**
   - 特に `note`, `user`
3. **既存 AP URI との互換性保持**
4. **同一インスタンス内の異テナント関係をローカル扱いするか連合扱いするか**
5. **Meta のどこまでを global / tenant に分けるかの線引き**
6. **キャッシュ・ストレージ・キュー・レートリミットの tenant 境界統一**
7. **Passkey 再登録や外部 OAuth クライアント設定変更の運用負荷**

## 8. 推奨する次アクション

1. `TenantResolverService` / `tenant_host_mapping` の最小実装を先に入れる
2. `CleanRemote*ProcessorService` と `AuthenticateService` の保護を最優先で実装する
3. `Meta` 分離方針（`tenant_meta` 新設か `Meta.host` 追加か）を決定する
4. primary tenant へのデータ移行リハーサルをステージングで実施する
