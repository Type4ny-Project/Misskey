# T07 動作確認

2026-10-04、Calls の `d1f0e95cfb0ba67cf44e2e047fb83a5d5d9b815b` を基点とした専用 worktree で検証。専用 PostgreSQL 18 / Redis 7、ローカル Misskey、Chromium の独立した2つのログイン状態を使用した。

| 検証 | 結果 |
| --- | --- |
| DrawingService unit（同期、権限、消去・終了、参加枠、ChatRoom、Calls 接続） | PASS: 6件 |
| `pnpm --filter backend test:e2e --run test/e2e/calls.ts` | PASS: 8件。Calls 有効の試験設定で公開キャンバスの lifecycle も実行 |
| backend / frontend typecheck | PASS |
| `pnpm build-misskey-js-with-types` | PASS |
| frontend build | PASS |
| 変更ファイルの `eslint --quiet` / locale safety | PASS |
| SPDX 全体検査 | BASELINE: 基点にある migration 2件のヘッダー欠落。今回の追加ファイルは欠落なし |

ブラウザーでは次を確認した。2人がマウスで描画した後のキャンバス画像が一致し、再読込でも一致する。消しゴムと文字チャットが相手へ反映される。全消去をキャンセルすると線が残り、確定すると両画面で白紙になる。PNG をドライブに保存すると 1280×720 の画像が作られ、投稿フォームには画像が添付される。投稿は実送信しない。390px 幅でもキャンバスが画面内に収まる。ホストによる退出で相手の画面と API のアクセスが拒否され、終了後は描画が無効になり保存は有効のままになる。ページの未処理 JavaScript エラーは0件。

PR 前レビューで見つかった表示の復帰と参加拒否の扱いを修正後、追加のブラウザー確認も PASS。描画 API の送信を一時的に abort し、キャンバスを保持したまま再読込なしで復帰することを確認した。自動参加の応答を `DRAWING_ACCESS_DENIED`（読み取り専用相当）・`DRAWING_ROOM_FULL` に置き換えた場合も、取得済みの絵と保存ボタンは維持し、描画だけを無効にすることを確認した。

最終修正の追加確認も PASS。未開始の `canvas: null` 応答で通信状態と開始ボタンが復帰する。古い heartbeat の `DRAWING_INVALID_STATE` 応答は再取得で復帰し、絵と保存ボタンを維持する。501文字の入力では送信を止め、入力 API の拒否応答でも文章とキャンバスを保持する。ChatRoom のリアクション追加・取消は再読込なしで表示へ反映する。短い線の終了時にも送信するため描画上限を毎分600件へ調整し、専用サーバーを `NODE_ENV=production` で起動して毎分300件を超える340件の要求が通ることを確認した。

追加の修正確認も PASS。参加枠に本人が残る snapshot と参加拒否を組み合わせても、描画・heartbeat は無効で、31秒後も閲覧・保存を維持する。表示中に受信した ChatRoom メッセージの既読通知を streaming で送ることを確認した。Calls 情報の応答を遅延させた状態で別ページへ移動しても、応答後に絵チャへ戻らない。型チェック・frontend build・変更ファイル lint は修正後にも実行した。

API では ChatRoom の招待・参加から絵チャを開き、外部ユーザーの拒否、既存 ChatRoom 文字チャット、退室後の取得・描画拒否を確認した。Calls 限定では試験用の有効な participant / Redis 接続状態を用い、接続ありのホストだけが開始・取得でき、未接続メンバーと接続失効後のホストは拒否されることを確認した。

Cloudflare の実音声接続は試験用認証情報のため SKIPPED。既存の音声・映像処理は変更していない。Redis の再起動後の保持は既存の永続化設定に依存する。

SPDX の既存違反は `packages/backend/migration/1774789240317-event.js` と `packages/backend/migration/1778352600000-hashtagFollowing.js`。マージ済 migration は変更していない。

![デスクトップ](screenshots/desktop.png)

![スマホ幅](screenshots/mobile.png)

2026-10-04、Calls PR #18 のマージ後の `origin/develop`（`eaf828bb2c`）を取り込み、SDK を再生成して競合を解消した。取り込み後も DrawingService unit 6件、Calls API e2e 8件、backend / frontend typecheck、`pnpm build-misskey-js-with-types`、変更ファイル lint・SPDX・locale safety はすべて PASS。上記の migration ヘッダー欠落は develop 側で修正済み。ブラウザー確認の記録は初回実装時のもの。

2026-10-06、最新 develop（`1dcdf3624a`）を取り込み、絵チャをCallsルーム内のアクティビティへ移した。DrawingService unit 7件、Calls API e2e 8件、frontend Calls関連 unit 51件、backend / frontend typecheck、SDK再生成、frontend build、アイコン生成、アクティビティのStorybook登録生成、lint・SPDX・locale safetyはすべて PASS。通話中の開閉・一覧への戻りでセッションを切断・再参加しないことと、ルーム終了時に開いたアクティビティを保持することをunitで確認した。

専用の新規DBとRedis DB 7を使い、独立した2ブラウザーで同じCalls画面内の描画同期、一覧へ戻ると絵チャの参加枠だけを解除すること、再表示時のキャンバス復帰、1280×720 PNGのドライブ保存、390px幅、アクティビティの閉じ直し、絵チャ終了後の保存可否を確認した。ホストが音声なしで絵チャを使う場合も、既存30秒更新でCallsの在席期限が延び、95秒待った後もルームがopenのままであることを確認。期限の延長fixtureは使っていない。ページの未処理JavaScriptエラーは0件。Cloudflare実音声接続は引き続きSKIPPED。スクリーンショットはこのルーム内UIのものへ差し替えた。
