# timelineHeader.vue D&D Fix

## TL;DR

> **問題**: `timelineHeader.vue` でドラッグ＆ドロップが動作しない
> **原因**: `manualDragStart` モードが正しく実装されていない（`mousedown` イベントは `DragEvent` ではないため `dataTransfer` が存在しない）
> **解決策**: `manualDragStart` を削除し、`navbar.vue` と同じネイティブドラッグ方式に変更
> 
> **変更ファイル**: `packages/frontend/src/pages/settings/timelineHeader.vue`
> **予想工数**: 2-3分

---

## Context

### 問題の詳細
`timelineHeader.vue` で `MkDraggable` コンポーネントを使用して項目の並び替えを実現しようとしているが、ドラッグ＆ドロップが機能しない。

### 原因分析
```vue
<!-- 現在の問題のある実装 -->
<MkDraggable v-model="items" direction="vertical" withGaps manualDragStart>
    <template #default="{ item, index, dragStart }">
        <div :class="$style.item">
            <!-- @mousedown は MouseEvent を発火するが、onDragstart は DragEvent を期待する -->
            <button class="_button" :class="$style.itemHandle" @mousedown="dragStart">
                <i class="ti ti-menu"></i>
            </button>
            ...
        </div>
    </template>
</MkDraggable>
```

**技術的な問題**:
1. `manualDragStart` が true の場合、`MkDraggable` は `:draggable="false"` を設定
2. `@mousedown="dragStart"` で呼ばれる `dragStart` は `onDragstart` 関数
3. `onDragstart` は `DragEvent` と `dataTransfer` を期待する
4. しかし `mousedown` イベントは `MouseEvent` であり `dataTransfer` プロパティが存在しない
5. そのため `ev.dataTransfer == null` で早期リターンされ、ドラッグが開始されない

### 参考: 動作する実装（navbar.vue）
```vue
<MkDraggable v-model="items" direction="vertical">
    <template #default="{ item }">
        <div :class="$style.item">
            <!-- @mousedown なし - ネイティブドラッグを使用 -->
            <button class="_button" :class="$style.itemHandle">
                <i class="ti ti-menu"></i>
            </button>
            ...
        </div>
    </template>
</MkDraggable>
```

---

## Work Objectives

### Core Objective
`timelineHeader.vue` のドラッグ＆ドロップを動作するように修正する

### Concrete Deliverables
- `packages/frontend/src/pages/settings/timelineHeader.vue` の修正

### Definition of Done
- [ ] ドラッグハンドルをつかんで項目を移動できる
- [ ] 項目の順序が変更された後、保存ボタンで設定が保存できる

### Must Have
- ネイティブドラッグ＆ドロップ方式に変更

### Must NOT Have
- `manualDragStart` モードの使用（動作しないため）

---

## Verification Strategy

### QA Policy
このタスク完了後、エージェントは以下のQAを実行する：
- ブラウザで設定ページを開き、ドラッグ＆ドロップが動作することを確認
- スクリーンショットを取得して証拠として保存

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (単一タスク):
└── Task 1: timelineHeader.vue の D&D 修正 [quick]
```

### Agent Dispatch Summary
- **1**: **1** — T1 → `quick`

---

## TODOs

- [ ] 1. timelineHeader.vue のドラッグ＆ドロップを修正

  **What to do**:
  - `packages/frontend/src/pages/settings/timelineHeader.vue` を開く
  - 11行目: `manualDragStart` プロパティを削除
  - 12行目: `dragStart` をスロットスコープから削除
  - 14行目: `@mousedown="dragStart"` を削除
  - ファイルを保存

  **修正前**:
  ```vue
  <MkDraggable v-model="items" direction="vertical" withGaps manualDragStart>
      <template #default="{ item, index, dragStart }">
          <div :class="$style.item">
              <button class="_button" :class="$style.itemHandle" @mousedown="dragStart">
  ```

  **修正後**:
  ```vue
  <MkDraggable v-model="items" direction="vertical" withGaps>
      <template #default="{ item, index }">
          <div :class="$style.item">
              <button class="_button" :class="$style.itemHandle">
  ```

  **Must NOT do**:
  - 他のプロパティ（`direction="vertical"`、`withGaps`）は削除しない
  - スタイルの変更は行わない

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 単純な削除作業、1ファイルのみの変更
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO（単一タスク）
  - **Blocks**: なし
  - **Blocked By**: なし

  **References**:
  - `packages/frontend/src/pages/settings/navbar.vue:12-21` - 動作する参照実装
  - `packages/frontend/src/components/MkDraggable.vue:29` - draggable プロパティの動作

  **Acceptance Criteria**:
  - [ ] `manualDragStart` プロパティが削除されている
  - [ ] `dragStart` がスロットスコープから削除されている
  - [ ] `@mousedown="dragStart"` が削除されている

  **QA Scenarios**:

  ```
  Scenario: ドラッグ＆ドロップで項目を移動できる
    Tool: Playwright
    Preconditions: 開発サーバーが起動している
    Steps:
      1. ブラウザで `/settings/timelineHeader` を開く
      2. ドラッグハンドル（⋮ アイコン）にマウスを合わせる
      3. マウスを押しながら別の位置に移動
      4. マウスを離す
    Expected Result: 項目が新しい位置に移動し、順序が変更される
    Failure Indicators: ドラッグが開始されない、項目が移動しない
    Evidence: .sisyphus/evidence/task-1-dnd-working.png

  Scenario: 変更を保存できる
    Tool: Playwright
    Preconditions: 項目の順序を変更済み
    Steps:
      1. 「保存」ボタンをクリック
      2. 確認ダイアログで「OK」をクリック
    Expected Result: 設定が保存され、リロード後も順序が保持される
    Failure Indicators: エラーが表示される、保存されない
    Evidence: .sisyphus/evidence/task-1-save-working.png
  ```

  **Evidence to Capture**:
  - [ ] ドラッグ中のスクリーンショット
  - [ ] 保存後のスクリーンショット

  **Commit**: YES
  - Message: `fix(frontend): fix drag & drop in timelineHeader settings`
  - Files: `packages/frontend/src/pages/settings/timelineHeader.vue`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `quick`
  - `timelineHeader.vue` を開き、以下を確認：
    - `manualDragStart` が存在しない
    - `@mousedown="dragStart"` が存在しない
    - `dragStart` がスロットスコープにない
  Output: `VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **1**: `fix(frontend): fix drag & drop in timelineHeader settings` — timelineHeader.vue, npm run lint（該当ファイル）

---

## Success Criteria

### Verification Commands
```bash
# ビルドエラーがないことを確認
cd packages/frontend && npm run typecheck

# リントエラーがないことを確認
npm run lint -- --fix packages/frontend/src/pages/settings/timelineHeader.vue
```

### Final Checklist
- [ ] ドラッグ＆ドロップが動作する
- [ ] ビルドエラーがない
- [ ] リントエラーがない
