## 1. プロダクト判断とプロバイダー契約

- [x] 1.1 `personal`が2人のDM通話ではなく、1人が開催する複数人ルームを意味することを確認し、初期の公開範囲と参加ルールを記録する
- [x] 1.2 speaker / listenerの上限、ChatRoom Callsを作成できる人、発言リクエストを初期対象に含めるかを決定する
- [x] 1.3 プロジェクトのBrowserslistと最新互換性データから、対応Chrome / Firefoxのmajor version表を固定する
- [x] 1.4 現行Cloudflare Realtime OpenAPI schema、制限、error code、test fixtureをprovider contract moduleへ取り込む
- [x] 1.5 初期Calls protocol version、第三者アプリquota、対応認証方式、アカウントなしguest招待を無効のままにするかを決定する

## 2. データモデルとmigration

- [x] 2.1 SPDX header付きのCalls room、participant、moderation history entityを追加し、repositoryへ登録する
- [x] 2.2 `personal` / `chatRoom`の排他所属、terminal lifecycle、一意なparticipant membership、room revisionのDB制約を追加する
- [x] 2.3 merge済みmigrationを変更せず、完全な`up()` / `down()`を持つ新しいtimestamp migrationを生成する
- [ ] 2.4 entityとstate transitionのtestを追加し、`pnpm --filter backend check-migrations`を実行する

## 3. ルームドメインと認可

- [x] 3.1 roomの作成、検索、snapshot、開始、終了、中止、参加、退出serviceを実装する
- [ ] 3.2 personal visibilityとChatRoom membership認可を実装し、ChatRoom access変更時に即時失効させる
- [x] 3.3 host / speaker / listener遷移、古いrevisionの拒否、参加者削除、変更不能なmoderation auditを実装する
- [x] 3.4 永続participant historyと、TTL付きlive connection generationの確定的な置換・cleanupを実装する
- [ ] 3.5 lifecycle、所属制約、access失効、role競合、terminal state、古いgenerationのbackend unit testを追加する

## 4. Cloudflare Realtime連携

- [x] 4.1 Cloudflare Realtime App ID / Secretと任意のTURN credentialについて、検証済みinstance設定とsecret読込を追加する
- [x] 4.2 session create / show、track add / update / close、renegotiateを扱う型付きCloudflare clientをtimeoutと構造化error mapping付きで実装する
- [x] 4.3 room、participant、connection、generation、media kind、source identityをkeyにしたserver-side session / track binding ownershipを実装する
- [x] 4.4 session作成、publish、subscribe、renegotiate、close、reconcile、任意のTURN credential発行を行う認証済みmedia endpointを実装する
- [ ] 4.5 すべてのmedia mutationで現在のroom state、所属access、participant role、track ownership、idempotency、batching、rate limitを強制する
- [ ] 4.6 offer、answer、`requiresImmediateRenegotiation`、部分的track error、無通信cleanup、古いID、retry境界のprovider contract testを追加する

## 5. Calls streamingと状態照合

- [x] 5.1 lifecycle、participant、role、mute、speaking、track availabilityを配信する認可済みCalls room streaming channelを追加する
- [ ] 5.2 単調増加room revision / event sequence、欠落時snapshot照合、speaking event集約を追加する
- [ ] 5.3 membership、login、moderation、room lifecycle変更時にstream / media accessを失効させる
- [ ] 5.4 reconnect、event欠落、重複operation、Redis / live state消失復旧のmulti-node testを追加する

## 6. misskey-js API契約

- [x] 6.1 room / media APIのendpoint metadata、request validation、packed Calls schema、streaming event型を追加する
- [x] 6.2 `pnpm build-misskey-js-with-types`を実行し、生成された`packages/misskey-js/src/autogen/`差分をすべて含める
- [x] 6.3 排他的attachment union、room state、participant role、revision、media negotiation responseのmisskey-js type testを追加する

## 7. Chrome / Firefox共通frontend media core

- [x] 7.1 User-Agent分岐やprefixed APIを使わず、secure contextと標準APIのcapability detectionを実装する
- [ ] 7.2 明示的なマイク取得と、拒否、deviceなし、hardware failure、constraint不一致、permission保留の正規化処理を実装する
- [x] 7.3 Unified Plan transceiverを使い、connection generationごとに直列化された1つの`RTCPeerConnection` / Cloudflare Session controllerを実装する
- [x] 7.4 browser提供のRED / FEC / 補助codecを維持し、SDP mungingを避けたcapability由来のOpus優先を実装する
- [x] 7.5 Cloudflareへのlocal publish、remote subscribe、即時renegotiate、track close / update、authoritative reconcile flowを実装する
- [ ] 7.6 local mute、speaker降格、`replaceTrack`によるマイク切替、device消失、remote audio autoplay復旧、完全なresource cleanupを実装する
- [ ] 7.7 一時切断の猶予、terminal failure検出、新generationでのsession再構築、republish / resubscribeを実装する
- [ ] 7.8 state transition、operation直列化、permission error、device切替、古いresponseのfrontend unit testをbrowser API fakeで追加する

## 8. サードパーティー参加protocol

- [x] 8.1 `read:calls` / `write:calls`をMisskey app、OAuth 2.0、MiAuth、API token、endpoint、streaming認可経路へ追加する
- [x] 8.2 version付きprovider-neutral Calls OpenAPI契約、streaming event envelope、canonical error、idempotency、retry semanticsを定義・公開する
- [x] 8.3 protocol version、codec、media kind、role、limit、TURN、extension、guest policyのcapability discoveryを実装する
- [x] 8.4 instance、room、participant、app、connection generation、capability、expiry、nonceにbindされた短命media session credentialを実装する
- [ ] 8.5 OAuth / token revoke、hostによる削除、role喪失、quota処置、logout、room end時のmedia即時失効を実装する
- [x] 8.6 browser、libwebrtc、Pion実装に利用できるmisskey-js reference helperとwire-level exampleを追加する
- [ ] 8.7 auth scope、capability negotiation、join、publish、subscribe、renegotiate、sequence gap、expiry、revoke、reconnect、cross-room攻撃のprovider mock conformance suiteを作る
- [x] 8.8 最小の独立第三者reference clientを作り、公式frontendのprivate moduleをimportしていないことを証明する

## 9. Callsユーザーインターフェース

- [x] 9.1 personal / ChatRoom Callsの入口、room作成、schedule / open / end操作、公開・非公開metadata表示を追加する
- [x] 9.2 listenerにはマイクaccessを要求しない、参加前role / device確認を追加する
- [ ] 9.3 participant一覧、host / speaker / listener操作、speaking / mute表示、server-authoritativeなmoderation feedbackを追加する
- [x] 9.4 room membershipとmedia connection、reconnect進行、非対応browser、permission復旧、provider failureの明示的UI stateを追加する
- [x] 9.5 日本語source localeを`locales/ja-JP.yml`だけへ追加し、他locale YAMLが手動変更されていないことを確認する

## 10. TURN・セキュリティ・プライバシー

- [ ] 10.1 user単位の任意の短命TURN credential、browser-safe ICE URL filter、`setConfiguration`更新、revokeを実装する
- [ ] 10.2 room作成・参加・media操作のAPI rate limitと、cross-room、cross-user、古いgeneration、listener publish攻撃のnegative testを追加する
- [ ] 10.3 microphone Permissions Policyとroom metadata sanitizeを適用し、secret、raw SDP、candidate address、credentialを不要にlog / API payloadへ入れないことを検証する
- [ ] 10.4 降格、削除、logout、ChatRoom access喪失、room end、非協力clientでserverがtrackを閉じるtestを追加する

## 11. 可観測性と運用

- [ ] 11.1 media、SDP、credential、raw IP addressを含まない構造化lifecycle eventとCloudflare operation metricを追加する
- [ ] 11.2 Chrome / Firefox間でcodec、candidate type、bitrate、packet loss、jitter、RTT、audio level、reconnect原因・復旧時間の`getStats()` fieldを正規化する
- [ ] 11.3 join成功率、p95 join latency、最初のremote audio、切断・復旧、browser差、provider error、relay利用、app identity、推定egressのdashboard / alertを追加する
- [ ] 11.4 feature flag、room / app quota、token / secret rotation、provider limit確認日、incident cleanup、app単位kill switch、code-first rollback手順を文書化する

## 12. E2E検証とリリース

- [ ] 12.1 分離したstaging Cloudflare Realtime App / TURN keyを用意し、production secretがcommitされていないことを確認する
- [ ] 12.2 実CloudflareでChrome同士、Firefox同士、ChromeからFirefox、FirefoxからChromeの2-browser E2Eを実行する
- [ ] 12.3 両browserでlistener参加、昇格・降格、mute / unmute、マイク切替・消失、network切断、TURN強制、reconnect、削除、room endを検証する
- [ ] 12.4 独立した第三者clientを実staging Cloudflareへ接続し、OAuth scope、publish / subscribe、revoke、quota、reconnectを検証する
- [ ] 12.5 backend unit / e2e、frontend、conformance test、`pnpm lint`、migration、misskey-js生成、SPDX、locale safetyを実行する
- [ ] 12.6 `CHANGELOG.md` UnreleasedのClient / Serverへ追記し、feature flag付きinternal / allowlist第三者rollout後に利用量と品質を確認して拡大する
