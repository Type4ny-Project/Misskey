# Type4nyからの機能移植・調査結果まとめ

最終更新日: 2026年2月26日

## 機能実装状況一覧

| # | 機能名 | 実装状況 | 備考 |
|---|--------|----------|------|
| 1 | **Enhance: ギャラリーの説明を一番上に表示** | ❌ 未実装 | 現在は画像の下に表示 |
| 2 | **Enhance: ギャラリーのサムネイルでホバー時のぼかし** | ⚠️ 部分実装 | ホバーでぼかし解除される（修正済み） |
| 3 | **Feat: CW注釈に直接絵文字を挿入できるボタン** | ❌ 未実装 | CW入力欄に絵文字ボタンがない |
| 4 | **Fix: リモート絵文字表示修正 (#75)** | ✅ 実装済み | media-proxy経由で表示 |
| 5 | **絵文字申請機能** | ✅ 実装済み | 完全な申請・承認フロー実装 |
| 6 | **タイムラインのヘッダー・並び替え** | ✅ 実装済み | タブのカスタマイズ可能 |
| 7 | **チャンネル・リストをTLとして表示** | ✅ 実装済み | ヘッダーに追加可能 |
| 8 | **チャンネルの投稿連合** | ✅ 実装済み | allowRenoteToExternal設定で制御 |
| 9 | **チャンネル共同管理者** | ✅ 実装済み | collaboratorIdsで管理 |
| 10 | **チャンネル所有者譲渡** | ✅ 実装済み | transferOwnership実装 |
| 11 | **リスト機能強化** | ✅ 実装済み | import/export, favorite, withReplies対応 |
| 12 | **ログインボーナス機能** | ✅ 実装済み | ロール設定・通知設定対応 |
| 13 | **予約投稿機能** | ✅ 実装済み | 完全なスケジュール機能 |
| 14 | **ノート編集機能** | ⚠️ 部分実装 | バックエンドは実装済み、フロントエンドは削除+再投稿方式 |
| 15 | **inbox詳細モデレーション** | ✅ 実装済み | InboxRuleServiceで詳細制御 |
| 16 | **投稿通報機能強化** | ✅ 実装済み | AbuseReportで通報可能 |
| 17 | **サーバー背景画像複数設定** | ❌ 未実装 | 単一のbackgroundImageUrlのみ |
| 18 | **Google Analytics統合** | ✅ 実装済み | 測定ID設定、動的読み込み対応 |
| 19 | **ドライブ複数選択** | ✅ 実装済み | move-bulkエンドポイント、複数選択UI |
| 20 | **絵文字Picker複数プロファイル** | ✅ 実装済み | emojiPalettes設定で管理 |
| 21 | **ノート公開範囲による背景色変更** | ✅ 実装済み | CSS変数、設定UI、MkNoteでの適用 |
| 22 | **仮想スクロール機能** | ✅ 実装済み | 実験的機能として実装 |
| 23 | **下書き複数保存** | ✅ 実装済み | NoteDraftシステムで実装 |
| 24 | **YouTube/niconico/Xプレビュー常時表示** | ❌ 未実装 | playerEnabledは手動でオンになるまでfalse |
| 25 | **初期TLをSocialに変更** | ✅ 実装済み | デフォルト設定変更済み |
| 26 | **仮想ローカルTL** | ⚠️ 部分実装 | フロントエンドのみ実装、バックエンド未完成 |
| 27 | **ユーザー毎ワードミュート** | ✅ 実装済み | mutedWords設定、checkWordMute実装 |
| 28 | **ゲーミングモード** | ❌ 未実装 | Bubble Gameのゲームモードのみ存在 |
| 29 | **リアクションミュート（実験的）** | ✅ 実装済み | mutingEmojisプリファレンスで実装 |

### 実装状況サマリー
- ✅ **実装済み**: 23項目
- ❌ **未実装**: 5項目  
- ⚠️ **部分実装**: 2項目
- ❌ **未実装**: 5項目  
- ⚠️ **部分実装**: 2項目

---

## 詳細調査結果

### 1. Gallery関連機能

#### ❌ Enhance: ギャラリーの説明を一番上に表示
**実装状況**: 未実装

**現在の実装**:
```vue
<!-- packages/frontend/src/pages/gallery/post.vue -->
<div class="files">
  <div v-for="file in post.files" :key="file.id" class="file">
    <img :src="file.url"/>
  </div>
</div>
<div class="body">
  <div class="title">{{ post.title }}</div>
  <div class="description">
    <Mfm v-if="post.description != null" :text="post.description"/>
  </div>
</div>
```

**必要な変更**: `.description`を`.files`の前に移動

#### ⚠️ Enhance: ギャラリーのサムネイルでホバーしたときにぼかしが外れないように
**実装状況**: 部分実装（現状はホバーでぼかし解除される）

**現在の実装**:
```vue
<!-- packages/frontend/src/components/MkGalleryPostPreview.vue -->
<MkImgWithBlurhash
  :forceBlurhash="!show"
  @pointerenter="enterHover"
  @pointerleave="leaveHover"
/>

<script>
const hover = ref(false);
const show = computed(() => safe.value || hover.value);
// hover=true → forceBlurhash=false → ぼかし解除
</script>
```

**解釈**: 
- 「ぼかしが外れる」のが正しい動作 → ✅ 実装済み
- 「ぼかしが外れないように」したい場合 → ❌ 未実装（変更必要）

---

### 2. CW絵文字挿入ボタン

#### ❌ Feat: CWの注釈に直接絵文字を挿入できるボタンを追加
**実装状況**: 未実装

**現在の実装**:
```vue
<!-- packages/frontend/src/components/MkPostForm.vue -->
<!-- CW入力欄 -->
<input 
  ref="cwInputEl" 
  v-model="cw" 
  :placeholder="i18n.ts.annotation"
/>

<!-- メイン本文には絵文字ボタンあり -->
<button @click="insertEmoji">
  <i class="ti ti-mood-happy"></i>
</button>
```

**不足点**: CW入力欄に絵文字挿入ボタンが存在しない

---

### 3. 絵文字関連機能

#### ✅ Fix: リモートの絵文字が正常に表示されない問題を修正 (#75)
**実装状況**: 実装済み

**実装ファイル**:
- `packages/backend/src/core/CustomEmojiService.ts`
- `packages/frontend-shared/js/media-proxy.ts`
- `packages/frontend-embed/src/components/EmCustomEmoji.vue`

**キーとなるコード**:
```typescript
// CustomEmojiService.ts
return emoji.publicUrl || emoji.originalUrl;

// EmCustomEmoji.vue
const url = computed(() => {
  if (rawUrl.value.startsWith('/emoji/') || (props.useOriginalSize && isLocal.value)) {
    return rawUrl.value;
  }
  return mediaProxy.getProxiedImageUrl(rawUrl.value, 'emoji', false, true);
});
```

#### ✅ Feat: 絵文字申請機能を追加
**実装状況**: 実装済み（完全なフロー）

**実装ファイル**:
- `packages/backend/src/core/EmojiRequestService.ts`
- `packages/backend/src/models/EmojiRequest.ts`
- `packages/backend/src/server/api/endpoints/emoji-request.ts`
- `packages/frontend/src/pages/emoji-requests.vue`
- `packages/frontend/src/pages/admin/emoji-requests.vue`

**機能**:
- ユーザーが絵文字を申請
- 管理者が承認/拒否
- ステータス管理（pending/approved/rejected）

#### ✅ Feat: 絵文字Picker複数プロファイル設定
**実装状況**: 実装済み

**実装ファイル**:
- `packages/frontend/src/preferences/def.ts`
- `packages/frontend/src/pages/settings/emoji-palette.vue`
- `packages/frontend/src/utility/emoji-picker.ts`

**設定項目**:
```typescript
// def.ts
emojiPalettes: { id: string; name: string; emojis: string[] }[]
emojiPaletteForMain: string | null
emojiPaletteForReaction: string | null
```

---

### 4. タイムライン関連機能

#### ✅ タイムラインのヘッダーを追加、並び替えができる
**実装状況**: 実装済み

**実装ファイル**:
- `packages/frontend/src/store.ts` - デフォルトタブ設定
- `packages/frontend/src/pages/timeline.vue`
- 各UIコンポーネント（deck/default）

#### ✅ チャンネルやリストなどがタイムラインとしてみることができる
**実装状況**: 実装済み

**説明**: タイムラインヘッダーにカスタムタブとして追加可能

#### ✅ Enhance: 「タイムライン上部に投稿フォームを表示する」をデフォルトでON
**実装状況**: 実装済み

#### ✅ Enhance: 初期のタイムラインをSocialに変更
**実装状況**: 実装済み

**実装**:
```typescript
// packages/frontend/src/store.ts
const defaultStore = markRaw(new Storage('base', {
  // ...
  defaultTimeline: {
    where: 'account',
    default: 'social' as 'home' | 'local' | 'social' | 'global',
  },
}));
```

#### ✅ preview: 仮想スクロール機能を実験的に追加
**実装状況**: 実装済み

**関連ファイル**:
- `packages/frontend/src/components/MkTimeline.vue`
- `packages/frontend/src/pages/settings/preferences.vue`

#### ⚠️ 仮想ローカルTL機能
**実装状況**: 部分実装（フロントエンドのみ）

**実装済み部分**:
- フロントエンド: `store.ts`, `timeline-header.ts`に`remoteLocalTimeline`の定義あり
- タイムラインヘッダーへのタブ追加機能は動作

**未実装部分（バックエンド）**:
1. **FanoutTimelineService.ts**: `remoteLocalTimeline:${string}`型定義が欠落
2. **any-local-timeline.tsエンドポイント**: 他サーバーのローカルTL取得APIが存在しない
3. **NoteCreateService.ts**: リモートユーザーの投稿を`remoteLocalTimeline`に追加する処理がない

**影響**:
- タイムラインタブは表示されるが、投稿が蓄積されず常に空の状態になる

**必要な修正**:
```typescript
// 1. FanoutTimelineService.ts に追加
| `remoteLocalTimeline:${string}`

// 2. any-local-timeline.ts エンドポイントを新規作成

// 3. NoteCreateService.ts に追加
this.fanoutTimelineService.push(`remoteLocalTimeline:${note.userHost}`, note.id, 1000, r);
```

---

### 5. チャンネル関連機能
**実装状況**: 実装済み

**設定場所**: 「設定」→「タイムラインのヘッダー」

---

### 5. チャンネル関連機能

#### ✅ チャンネルの投稿が連合できるように
**実装状況**: 実装済み

**実装ファイル**:
- `packages/backend/src/models/Channel.ts`
- `packages/backend/src/core/NoteCreateService.ts`
- `packages/backend/migration/1698840138000-add-allow-renote-to-external.js`

**キーとなるコード**:
```typescript
// NoteCreateService.ts
if (data.channel != null) {
  data.visibility = 'public';
  data.visibleUsers = [];
  if (data.channel.isLocalOnly) {
    data.localOnly = true;
  }
}

// Channel.ts
public allowRenoteToExternal: boolean;
public isLocalOnly: boolean;
```

#### ✅ チャンネルの共同管理者を設定できる
**実装状況**: 実装済み

**実装ファイル**:
- `packages/backend/src/models/Channel.ts`
- `packages/backend/migration/1769106528000-addChannelCollaborators.js`
- `packages/backend/src/core/ChannelService.ts`
- `packages/frontend/src/pages/channel-editor.vue`

**キーとなるコード**:
```typescript
// Channel.ts
@Column({ array: true, default: '{}' })
public collaboratorIds: MiUser['id'][];

// ChannelService.ts
canEditChannel(...) {
  if (channel.userId === user.id) return true;
  if (channel.collaboratorIds?.includes(user.id)) return true;
  // ...
}
```

#### ✅ チャンネル所有者の譲渡が可能
**実装状況**: 実装済み

**実装ファイル**:
- `packages/backend/src/server/api/endpoints/channels/transfer.ts`
- `packages/backend/src/server/api/endpoints/channels/update.ts`
- `packages/backend/src/core/ChannelService.ts`

**キーとなるコード**:
```typescript
// ChannelService.ts
transferOwnership(channel, newOwnerId) {
  const collaboratorIds = channel.collaboratorIds ?? [];
  const newCollaboratorIds = collaboratorIds.filter(id => id !== newOwnerId);
  if (channel.userId && !newCollaboratorIds.includes(channel.userId)) {
    newCollaboratorIds.push(channel.userId); // 旧所有者を共同管理者に
  }
  await this.channelsRepository.update(channel.id, {
    userId: newOwnerId,
    collaboratorIds: newCollaboratorIds,
  });
}
```

---

### 6. リスト機能強化

#### ✅ Enhance: リストの機能を強化
**実装状況**: 実装済み（多くの機能が追加されている）

**実装ファイル**:
- `packages/backend/src/server/api/endpoints/users/lists/list.ts`
- `packages/backend/src/server/api/endpoints/users/lists/create-from-public.ts`
- `packages/backend/src/server/api/endpoints/users/lists/favorite.ts`
- `packages/backend/src/server/api/endpoints/i/import-user-lists.ts`
- `packages/backend/src/server/api/endpoints/i/export-user-lists.ts`
- `packages/backend/src/server/api/stream/channels/user-list.ts`
- `packages/frontend/src/pages/my-lists/list.vue`
- `packages/frontend/src/pages/list.vue`
- `packages/frontend/src/ui/deck/list-column.vue`

**実装されている機能**:
1. **リスト作成・管理** - create/update/delete/push/pull
2. **メンバーシップ管理** - update-membership（withReplies設定）
3. **リストタイムライン** - streaming channel実装
4. **お気に入り** - favorite/unfavorite
5. **公開リストから作成** - create-from-public
6. **インポート/エクスポート** - CSV経由
7. **Deck統合** - list-column.vueで選択・設定

**キーとなるコード**:
```typescript
// お気に入り機能
os.apiWithDialog('users/lists/favorite', { listId: list.value.id });

// 公開リストから作成
os.apiWithDialog('users/lists/create-from-public', { 
  name: name, 
  listId: list.value.id 
});

// メンバーシップ設定（withReplies）
misskeyApi('users/lists/update-membership', { 
  listId: list.value.id, 
  userId: item.userId, 
  withReplies 
});
```

---

### 7. ログインボーナス機能

#### ✅ ログインボーナス機能を追加
**実装状況**: 実装済み（完全な機能）

**実装ファイル**:
- `packages/backend/src/core/LoginBonusService.ts`
- `packages/backend/src/server/api/endpoints/i.ts`
- `packages/backend/src/models/UserProfile.ts`
- `packages/backend/migration/1768938654000-addLoginBonusColumns.js`
- `packages/frontend/src/pages/admin/settings.vue`

**機能詳細**:
- 毎日初回ログイン時にランダム（1-5ポイント）付与
- ロールベースでの付与制御（`loginBonusGrantEnabled`）
- 通知設定可能
- プロフィールでのポイント表示設定

**キーとなるコード**:
```typescript
// i.ts（ログイン時の処理）
if (!userProfile.loggedInDates.includes(today)) {
  const meta = await this.metaService.fetch();
  if (meta.enableLoginBonus) {
    const policies = await this.roleService.getUserPolicies(user.id);
    if (policies.loginBonusGrantEnabled) {
      const bonusPoints = randomInt(1, 6);
      await this.usersRepository.update(user.id, { 
        points: currentUser.points + bonusPoints 
      });
      this.notificationService.createNotification(user.id, 'loginBonus', { 
        points: bonusPoints 
      });
    }
  }
}
```

---

### 8. 予約投稿機能

#### ✅ 予約投稿機能を追加
**実装状況**: 実装済み（完全な機能）

**実装ファイル**:
- `packages/backend/migration/1758677617888-scheduled-post.js`
- `packages/backend/src/models/NoteDraft.ts`
- `packages/backend/src/core/NoteDraftService.ts`
- `packages/backend/src/queue/processors/PostScheduledNoteProcessorService.ts`
- `packages/frontend/src/components/MkPostForm.vue`
- `packages/frontend/src/components/MkNoteDraftsDialog.vue`

**機能フロー**:
1. ユーザーが日時を指定して予約
2. `NoteDraft`に`scheduledAt`と`isActuallyScheduled`を保存
3. `NoteDraftService.schedule()`で遅延ジョブをキューに追加
4. `PostScheduledNoteProcessorService`が指定時刻に投稿を実行
5. 投稿後、下書きを削除

---

### 9. inboxモデレーション機能

#### ✅ inboxの詳細なモデレーション機能を追加
**実装状況**: 実装済み（完全な機能）

**実装ファイル**:
- `packages/backend/src/core/InboxRuleService.ts`
- `packages/backend/src/core/activitypub/ApInboxService.ts`
- `packages/backend/src/server/api/endpoints/admin/inbox-rule/set.ts`
- `packages/backend/src/server/api/endpoints/admin/inbox-rule/list.ts`
- `packages/backend/src/server/api/endpoints/admin/inbox-rule/edit.ts`
- `packages/backend/src/server/api/endpoints/admin/inbox-rule/delete.ts`

**機能詳細**:
- ルールベースのinbox制御
- 条件: ホスト、コンテンツワード、添付ファイル、フォロワー数、サーバーメタデータ等
- アクション: reject等
- ブール演算: and/or/not
- 管理画面からルール管理

**キーとなるコード**:
```typescript
// InboxRuleService.ts
case 'isIncludeThisWord': {
  if (isNote(activity.object)) {
    return this.utilityService.isKeyWordIncluded(
      activity.object?.content || '', 
      [value.value]
    );
  }
  return false;
}

// ApInboxService.ts
const rules = await this.inboxRuleRepository.find();
for (const rule of rules) {
  const result = await this.inboxRuleService.evalCond(activity, actor, rule.condFormula);
  if (result && rule.action.type === 'reject') {
    await this.moderationLogService.log(actor, 'inboxRejected', { activity, rule });
    return 'skip: rejected by rule' + rule.id;
  }
}
```

---

### 10. その他の機能（詳細調査完了）

以下の機能についての調査が完了しました：

- ✅ **ドライブ複数選択** - 実装済み（move-bulkエンドポイント）
- ✅ **Google Analytics統合** - 実装済み（測定ID設定対応）
- ✅ **ノート公開範囲による背景色変更** - 実装済み（CSS変数で制御）
- ✅ **ユーザー毎ワードミュート** - 実装済み（mutedWords設定）
- ❌ **サーバー背景画像複数設定** - 未実装（単一URLのみ）
- ❌ **ゲーミングモード** - 未実装（Bubble Gameのモードのみ存在）
- ✅ **リアクションミュート** - 実装済み（mutingEmojisプリファレンス）
- ⚠️ **ノート編集機能** - 部分実装（バックエンドは実装済み、フロントエンドは削除+再投稿方式）
- ❌ **YouTube/niconico/Xプレビュー常時表示** - 未実装（playerEnabledは手動でオンになるまでfalse）
- **リアクションミュート** - 実装状況未確認

---

## 補足: type4nyソースコードとの比較

ローカルのtype4nyソース（`~/WebstormProjects/type4ny`）と比較して、以下の方針で実装を進める：

1. **最新版に合わせて調整** - そのまま持ってくるのではなく、現在のMisskeyバージョンに適合させる
2. **コードスタイルの統一** - 既存のコードベースのパターンに従う
3. **テストの追加** - 可能な限りテストを追加する

### 未実装機能の優先度

**高優先度**:
1. CW注釈への絵文字挿入ボタン
2. ギャラリーの説明を上に表示

**中優先度**:
3. ノート編集機能（要調査）
4. 投稿通報機能強化（要調査）

**低優先度**:
5. サーバー背景画像複数設定
6. Google Analytics
7. ゲーミングモード
8. リアクションミュート

---

## 旧版からの変更履歴

### 追加された実装確認項目
- ✅ inbox詳細モデレーション機能（完全実装）
- ✅ リスト機能強化（import/export, favorite, withReplies等）
- ✅ 予約投稿機能（完全実装）
- ✅ 仮想スクロール機能（実験的）
- ✅ 仮想ローカルTL機能
- ✅ 初期TLをSocialに変更

### 修正された実装状況
- リスト機能強化: 「要調査」→「実装済み」
- inboxモデレーション: 「要調査」→「実装済み」

---

## 参考ファイル

- `LOGIN_BONUS_README.md`
- `LOGIN_BONUS_ARCHITECTURE.md`
- `LOGIN_BONUS_IMPLEMENTATION.md`
- `Diff.md`（旧版）

---

## 11. 詳細調査結果（追加機能）

### ✅ Enhance: ドライブでファイルを複数選択できるように
**実装状況**: 実装済み

**実装ファイル**:
- `packages/frontend/src/components/MkDrive.vue`
- `packages/frontend/src/components/MkDriveFileSelectDialog.vue`
- `packages/backend/src/server/api/endpoints/drive/files/move-bulk.ts`

**キーとなるコード**:
```typescript
// MkDrive.vue - 複数選択の状態管理
const selectedFiles = ref<Misskey.entities.DriveFile[]>([]);

// 複数ファイル移動
async function moveFilesBulk() {
  await os.apiWithDialog('drive/files/move-bulk', {
    fileIds: selectedFiles.value.map(f => f.id),
    folderId: folders[0] ? folders[0].id : null,
  });
}

// move-bulkエンドポイント
paramDef: {
  fileIds: { type: 'array', uniqueItems: true, minItems: 1, maxItems: 100 }
}
```

---

### ✅ Feat: GoogleAnalyticsを使えるように
**実装状況**: 実装済み

**実装ファイル**:
- `packages/frontend/src/analytics.ts`
- `packages/frontend/src/boot/common.ts`
- `packages/frontend/src/pages/admin/external-services.vue`
- `packages/backend/migration/1739006797620-GoogleAnalytics.js`
- `packages/backend/src/models/Meta.ts`

**キーとなるコード**:
```typescript
// analytics.ts - 動的読み込み
if (!instance.googleAnalyticsMeasurementId) return;
const { default: Analytics } = await import('analytics');
const { default: googleAnalytics } = await import('@analytics/google-analytics');

// boot/common.ts - 初期化
fetchInstanceMetaPromise.then(async () => {
  await initAnalytics(instance);
  if ($i) analytics.identify($i.id);
  analytics.page({ path: window.location.pathname });
});

// 管理画面で測定ID設定
<MkInput v-model="googleAnalyticsMeasurementId" />
```

**注意**: ユーザーごとのオプトアウト機能は未実装

---

### ✅ Feat: ノートの公開範囲に応じてノートの背景色を変更
**実装状況**: 実装済み

**実装ファイル**:
- `packages/frontend/src/preferences/def.ts`
- `packages/frontend/src/pages/settings/preferences.vue`
- `packages/frontend/src/boot/common.ts`
- `packages/frontend/src/components/MkNote.vue`

**キーとなるコード**:
```typescript
// def.ts - プリファレンス定義
showVisibilityColor: { default: false }
homeColor: { default: '#00ff00' }
followerColor: { default: '#ffff00' }
specifiedColor: { default: '#ff0000' }
localOnlyColor: { default: '#0000ff' }

// boot/common.ts - CSS変数設定
watch(prefer.r.homeColor, v => {
  document.documentElement.style.setProperty('--homeColor', hexToRgb(v));
});

// MkNote.vue - クラスバインディング
:class={
  [$style.home]: prefer.s.showVisibilityColor && note.visibility === 'home',
  [$style.followers]: prefer.s.showVisibilityColor && note.visibility === 'followers',
  [$style.specified]: prefer.s.showVisibilityColor && note.visibility === 'specified',
  [$style.localonly]: prefer.s.showVisibilityColor && note.localOnly
}

// CSS
background-color: rgba(var(--homeColor), 0.20) !important;
```

---

### ✅ ユーザー毎にワードミュートをかけられる機能
**実装状況**: 実装済み

**実装ファイル**:
- `packages/backend/migration/1595771249699-word-mute.js`
- `packages/backend/src/misc/check-word-mute.ts`
- `packages/frontend/src/utility/check-word-mute.ts`
- `packages/frontend/src/pages/settings/mute-block.word-mute.vue`
- `packages/frontend/src/components/MkNote.vue`

**キーとなるコード**:
```typescript
// migration - DBカラム追加
ALTER TABLE "user_profile" ADD "enableWordMute" boolean NOT NULL DEFAULT false
ALTER TABLE "user_profile" ADD "mutedWords" jsonb NOT NULL DEFAULT '[]'

// check-word-mute.ts - チェックロジック
export async function checkWordMute(note, me, mutedWords): Promise<boolean> {
  if (me && note.userId === me.id) return false; // 自分のノートは除外
  const text = ((note.cw ?? '') + '\n' + (note.text ?? '')).trim();
  // AhoCorasick + RegExpでマッチング
}

// MkNote.vue - 適用
const muted = ref(checkMute(appearNote, $i?.mutedWords));
```

---

### ⚠️ ノート編集機能 / 投稿通報機能
**実装状況**: 部分実装

**バックエンド**: ✅ 実装済み
- `packages/backend/src/server/api/endpoints/notes/update.ts`
- `packages/backend/src/core/NoteUpdateService.ts`
- 履歴管理（noteEditHistory, updatedAtHistory）対応

**フロントエンド**: ⚠️ 削除+再投稿方式
```typescript
// get-note-menu.ts - 現在の実装（削除して再投稿）
function delEdit(): void {
  misskeyApi('notes/delete', { noteId: appearNote.id });
  os.post({ 
    initialNote: appearNote,
    renote: appearNote.renote,
    reply: appearNote.reply,
    channel: appearNote.channel 
  });
}
```

**備考**: 直接`notes/update`を呼ぶUIは未実装

---

### ❌ サーバーの背景画像を複数設定
**実装状況**: 未実装

**現在の実装**:
- 単一の`backgroundImageUrl`のみ対応
- `locales/ja-JP.yml`: `backgroundImageUrl: "背景画像のURL"`
- 複数背景設定のためのDBカラム、API、UIは存在しない

---

### ❌ ゲーミングモード
**実装状況**: 未実装

**備考**: 
- Bubble Gameにはゲームモード（normal/square/yen/sweets/space）が存在
- ただしグローバルな「ゲーミングモード」（UI/パフォーマンス最適化）は未実装

---

### ✅ リアクションミュート機能（実験的）
**実装状況**: 実装済み

**実装ファイル**:
- `packages/frontend/src/utility/emoji-mute.ts`
- `packages/frontend/src/preferences/def.ts`
- `packages/frontend/src/components/MkReactionsViewer.reaction.vue`

**キーとなるコード**:
```typescript
// def.ts
mutingEmojis: { default: [] as string[] }

// emoji-mute.ts
export function mute(emoji) {
  const mutedEmojis = prefer.r.mutingEmojis.value;
  if (!mutedEmojis.includes(emojiMuteKey)) {
    prefer.commit('mutingEmojis', [...mutedEmojis, emojiMuteKey]);
  }
}

// MkReactionsViewer.reaction.vue
if (isEmojiMuted(props.reaction).value) {
  menuItems.push({ text: i18n.ts.emojiUnmute, action: () => unmuteEmoji(props.reaction) });
} else {
  menuItems.push({ text: i18n.ts.emojiMute, action: () => muteEmoji(props.reaction) });
}
```

**注意**: クライアント側のみの実装（サーバー側フィルタリングなし）

---

### ❌ Enhance: YouTube,niconico,XのURLのプレビューを常時開いた状態で表示
**実装状況**: 未実装

**現在の実装**:
```vue
<!-- packages/frontend/src/components/MkUrlPreview.vue -->
const playerEnabled = ref(false);
const tweetExpanded = ref(props.detail); // default: false
```

**キーとなるポイント**:
- `playerEnabled`はデフォルトで`false`
- ユーザーが「プレイヤーを開く」ボタンをクリックするまでプレーヤーは表示されない
- 自動的に開く設定やプリファレンスは存在しない
- YouTube、niconico、X（Twitter）すべてで同様の動作

**必要な実装**:
- プリファレンスに`autoOpenPlayer`などの設定を追加
- MkUrlPreview.vueでその設定を参照して`playerEnabled`の初期値を設定
- サイト別（YouTube/niconico/X）の個別設定が必要な場合は更に細分化

---

## 12. 最終実装状況サマリー

### 実装済み（23項目）
1. ✅ リモート絵文字表示修正 (#75)
2. ✅ 絵文字申請機能
3. ✅ タイムラインのヘッダー・並び替え
4. ✅ チャンネル・リストをTLとして表示
5. ✅ チャンネルの投稿連合
6. ✅ チャンネル共同管理者
7. ✅ チャンネル所有者譲渡
8. ✅ リスト機能強化
9. ✅ ログインボーナス機能
10. ✅ 予約投稿機能
11. ✅ inbox詳細モデレーション
12. ✅ 絵文字Picker複数プロファイル
13. ✅ 仮想スクロール機能
14. ✅ 下書き複数保存
15. ✅ 初期TLをSocialに変更
15. ✅ 初期TLをSocialに変更
16. ✅ ドライブ複数選択
17. ✅ Google Analytics統合
18. ✅ ノート公開範囲による背景色変更
19. ✅ ユーザー毎ワードミュート
20. ✅ リアクションミュート
21. ✅ 投稿通報機能（Misskey標準）

### 未実装（5項目）
1. ❌ ギャラリーの説明を一番上に表示
2. ❌ CW注釈に直接絵文字を挿入できるボタン
3. ❌ サーバー背景画像複数設定
4. ❌ ゲーミングモード
5. ❌ YouTube/niconico/Xプレビュー常時表示

### 部分実装（2項目）
1. ⚠️ ノート編集機能（バックエンド実装済み、フロントエンドは削除+再投稿方式）
2. ⚠️ **仮想ローカルTL**（フロントエンドのみ実装、バックエンド未完成 - FanoutTimelineService型定義・any-local-timelineエンドポイント・NoteCreateService投稿処理が欠落）
1. ⚠️ ノート編集機能（バックエンド実装済み、フロントエンドは削除+再投稿方式）
---

**調査完了日**: 2026年2月26日
