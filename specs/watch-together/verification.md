# Watch Together 動作確認

2026-10-06、Activity の土台 `codex/calls-activities`（PR #76、`eee7ed4786`）をベースに実装。絵チャ PR #34 への依存はない。

Calls の閲覧権限を持つユーザーが、ルーム内 Activity から YouTube を視聴する。動画の変更・再生・停止・シークはホストと有効なルームモデレーターに限定する。既存のインスタンスモデレーター権限も維持する。視聴者の音量と再生許可は本人だけに作用する。動画ID、再生状態、位置の基準時刻、revision を Redis に7日間保持し、Calls の既存 streaming とロックを使う。音声に接続せず視聴しているホストも、30秒ごとの状態取得で在席期限を更新する。

- PASS: backend unit 99件（Watch Together 5件、CallsRoomChannel 6件、CallsRoomService 88件）、Calls API e2e 6件（Watch Together 2件を含む）。ホスト・有効なモデレーターの操作、視聴者の操作拒否、非公開ルーム・退出処分・OAuth権限、途中参加・古いrevision・終了時の停止を確認。
- PASS: frontend Calls unit 60件（URLの検証、視聴者の同期、ホスト操作、プレーヤーの解放、ローカル再生許可を含む）、backend / frontend typecheck、SDK再生成、i18n build、frontend build、アイコン・Storybook登録生成、変更ファイル lint・SPDX・locale safety。
- PASS: 専用サーバー（localhost:61917、専用PostgreSQLとRedis）と独立した2ブラウザーで、実際のYouTube IFrame APIと動画を使用。動画選択、再生、30秒へのシーク、一時停止を確認し、両プレーヤーの再生位置差は3秒未満だった。390px幅で動画が収まり、ページの未処理JavaScriptエラーは0件。
- PASS: 同じローカルAPI・streamingに決定的なYouTubeプレーヤーfixtureを接続し、再表示時の位置復元、視聴者の操作拒否、モデレーター任命後の操作、ルーム終了時の停止を確認。未処理JavaScriptエラーは0件。

2026-10-06、UIをYouTube標準のボタン・タイムライン・音量操作に変更。独自の再生ボタン・秒数入力・音量スライダーを削除し、URL入力は動画の選択・変更時だけ表示する。

- PASS: 実際のYouTubeプレーヤーを独立した2ブラウザーで操作し、標準の再生・一時停止ボタン、停止中のタイムラインを30秒へシークする操作がAPI・streamingを通じて同期した。視聴者の標準操作は共有更新を送らず、モデレーター任命後は標準の一時停止操作がホスト側にも反映された。
- PASS: 1360×900と390×844で表示を確認。スマホ幅で動画のはみ出しなし、プレーヤー高さ200px以上。未処理JavaScriptエラー0件。
- PASS: frontend Calls unit 60件、frontend typecheck・build、変更ファイルlint・SPDX・locale safety。今回backend/APIの変更はないため、その検証とSDK生成は再実行していない。

広告ブロックは含めていない。[YouTube標準の埋め込みパラメーター](https://developers.google.com/youtube/player_parameters)には広告を無効化する機能がなく、親ページからiframe内の通信を制御できない。

YouTubeの埋め込み制限・地域制限・広告・ブラウザーの自動再生制限の影響は受ける。自動再生が止められた場合は「再生を許可」を表示する。実音声のCloudflare接続は試験用認証情報のため未検証。DB entity・migrationの変更はない。

![デスクトップ](screenshots/desktop.png)

![スマホ幅](screenshots/mobile.png)
