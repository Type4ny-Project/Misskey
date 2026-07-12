## Why（なぜ必要か）

Misskeyに、Twitter Spacesのように複数人がリアルタイム音声で会話できる「Misskey Calls」を追加したい。Cloudflare Realtime SFUはroomやpresenceを提供せずSessionとTrackだけを扱うため、Misskeyが会話の所属先、参加者、権限、ライフサイクルを明示的に管理する必要がある。

## What Changes（変更内容）

- Calls専用のルームを新設し、開催者個人に紐づく「パーソナルルーム」と、既存ChatRoomに紐づく「ChatRoomルーム」の2種類を表現する。
- Callsルームの作成、開始、参加、退出、終了、閲覧と、host / speaker / listenerの役割・発言権限を定義する。
- Misskey backendをCloudflare Realtime SFUの信頼境界かつ制御プレーンとし、CloudflareのSession / Track IDをMisskeyのルーム参加者へ安全に対応付ける。
- ChromeとFirefoxで共通のWebRTC標準APIを使う音声参加フロー、権限要求、SDP交渉、ICE接続、再接続、デバイス切替、エラー表示を定義する。
- Cloudflare App SecretとTURN Keyをブラウザへ公開せず、短命なTURN資格情報と認可済みSFU操作だけをbackend経由で提供する。
- 公式Webクライアント以外のサードパーティーWeb・ネイティブクライアント、Bot、配信ツールが、公開Calls APIとOAuth 2.0 / API tokenの権限を通じて同じルームへ参加できる拡張ポイントを提供する。
- サードパーティー向けにversionedなAPI schema、capability discovery、media negotiation contract、streaming events、SDK用型、conformance testを公開する。
- 音声を初期スコープとし、録音、文字起こし、動画、画面共有、連合先インスタンスとのメディア中継は初期リリースの対象外とする。

## Capabilities（追加する機能領域）

### New Capabilities（新規）

- `calls-room-domain`: 個人または既存ChatRoomに紐づくCallsルーム、参加者、役割、権限、状態遷移、可視性を定義する。
- `calls-realtime-media`: Cloudflare Realtime SFUとのSession / Track制御、WebRTC交渉、Chrome / Firefox互換動作、再接続、セキュリティ、運用要件を定義する。
- `calls-third-party-participation`: 外部アプリケーションがユーザー委任または明示的なBotアカウントとしてCallsへ安全に参加するための公開API、権限、互換性、失効を定義する。

### Modified Capabilities（変更）

なし。

## Impact（影響範囲）

- Backend: Calls用entity / migration / repository / service / API / streaming event、ChatRoom membership認可、Cloudflare Realtime API client、資格情報・設定、監査とレート制限。
- Frontend: Callsルーム画面、参加前確認、マイク権限・デバイス制御、参加者一覧、役割操作、WebRTC接続状態と復旧UI。
- misskey-js: Calls API、packed entity、streaming eventの型生成。
- Developer platform: OAuth scope、API / event schema、capability endpoint、misskey-js client helpers、第三者実装向けprotocol documentationとconformance suite。
- Infrastructure: Cloudflare Realtime SFU App、必要に応じたRealtime TURN key、secret管理、利用量・失敗率・接続品質の監視。
- Data: Callsルーム、参加者、個人リンクまたはChatRoomリンクを保持する新規テーブルと、履歴を改変しない新規migration。
