# Type4nyからの機能移植・調査結果まとめ

## 1. ログインボーナス機能
実装元コミット：`ec7b622126`, `cd9ab68ba1`, `cd23dba3a7`, `1715791271605-loginbonus1.js` 等
取得したパッチファイル：`diff-loginbonus.patch`

### 実装内容と移植方針
- **DB定義**: `User`テーブルに`getPoints` (所持ポイント) カラムを追加する。
- **機能**:
  - `i.ts`等で、その日初めてログイン(`loggedInDates`の更新時)した際に、ランダム(1〜5)のポイントを付与する。
  - `NotificationService.ts`にて付与時に通知を出す (`loginBonus` タイプ)。
- **設定**:
  - ユーザー単位で通知のON/OFFが可能(`notificationRecieveConfig` 等)。
  - ロールごとにログインボーナス機能を有効にするか (`loginBonusGrantEnabled`)。
  - プロフィール設定で自分が持っているポイント数を公開するかどうか (`loginBonusIsVisible`)。
- **リファクタリング方針**: `i.ts`内に直接ランダム値の算出やDB操作を書くのではなく、`LoginBonusService`を新設してカプセル化する。

## 2. チャンネル機能強化（共同管理者・譲渡）
実装元コミット：`diff-channel-collab.patch`, `diff-channel-transfer.patch` に出力

### 実装内容と移植方針
- **DB定義**: `Channel`テーブルに`collaboratorIds` を追加する（共同管理者）。
- **共同管理者機能**:
  - `channels/create.ts`, `channels/update.ts` において、`collaboratorIds`の配列を受け取り保存する。
  - 更新・削除権限等の判定に「自分自身、モデレーター、または共同管理者であるか」という判定を追加する。
- **譲渡機能**:
  - `channels/update.ts` で `transferAdminUserId` を受け取る。
  - 対象のユーザーが存在すれば、チャンネルの `userId` を上書きし、元の所有者を共同管理者に降格する（あるいは単純に移譲する）ロジックを実装。
- **UI**: `channel-editor.vue` に共同管理者の追加フォーム、および所有者移譲のボタン（危険操作）を追加。

## 3. タイムラインのタブ・ヘッダー並び替え機能
実装元コミット：`diff-tl-header.patch` に出力

### 実装内容と移植方針
- **機能**: TLの上部にヘッダー領域（`timelineHeader`）を追加し、ホーム・ローカル・ソーシャル・グローバル等の切り替えだけでなく、リストやチャンネル等のカスタムタブを設定・並び替え可能にする機能。
- **UI**: ユーザー設定等で表示するタブの種類・順序を管理し、`pages/timeline.vue` や `ui/deck/`, `ui/default/` 内のヘッダーレンダリングロジックを改修する。
- MisskeyのUIの根幹に関わるため、既存のUIコンポーネント（特に`<MkTimeline>`など）との結合を意識しつつ、丁寧に移植する。

## 4. リスト機能強化、チャンネルの投稿の連合
※これらの機能の明確な単独コミットが見つからなかったため、現在のTypeAnyベースに合わせて新規実装・または既存Misskeyの拡張として別途設計を行う。
- リスト機能強化：リストのピン留めやTL化などが上記ヘッダー対応に含まれている可能性がある。
- チャンネルの連合：`ApNoteService`等で、ノートがチャンネルに属している場合に連合する/しないの判定を解除または実装する方針。

## リストとタイムラインのタブ機能 (Type4ny 調査補足)
- `timeline.vue` やヘッダーコンポーネント (e.g. `MkTimeline.vue`, `MkHeader.vue`) に大幅な改修が入っている。
- `locales` で `timelineHeader` が定義されており、ヘッダーの表示切り替えなどが行える。

## チャンネル機能強化 (Type4ny 調査補足)
- `models/Channel.ts` に `@Column('jsonb', { default: [] }) public collaboratorIds: string[];` が追加。
- `channels/update.ts` にて、`transferAdminUserId` を受け取った場合、自分が所有者またはモデレーターであれば `userId` を譲渡先IDに更新する処理が実装されている。
- `collaboratorIds` を配列で受け取り更新・チェックするロジックも追加。

これらを基に、misskey-typeany のバックエンド・フロントエンドで実装を行なっていく方針となる。
### チャンネルの投稿の連合
Misskey本家では `NoteCreateService.ts` 内で `data.channel != null` の場合に強制的に `data.localOnly = true;` となっている。
Type4nyでは、以下のように変更され、チャンネル自体が `isLocalOnly` でない限りは連合されるようになっている。

```typescript
// Type4nyの変更点
if (data.channel != null) {
	data.visibility = 'public';
	data.visibleUsers = [];
	if (data.channel.isLocalOnly) { // チャンネル自体がローカル専用の場合のみ localOnly にする
		data.localOnly = true;
	}
}
```

さらに、`Channel` モデル自体にも `isLocalOnly` や関連するフラグを追加・修正している可能性があるので、同様に misskey-typeany でもこれらを実装する。
