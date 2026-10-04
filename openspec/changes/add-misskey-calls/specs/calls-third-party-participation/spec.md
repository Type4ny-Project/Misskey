## ADDED Requirements

### Requirement: 第三者clientは公式clientと同じ公開Calls契約を使う
システムはroom discovery、join、leave、media session、publish、subscribe、renegotiate、reconcile、event subscriptionを、公式clientと認可済み第三者clientの両方が利用する文書化済み公開Calls APIとして提供しなければならない（SHALL）。

#### Scenario: native clientがroomへ参加する
- **WHEN** 認可済みnative clientが公開Calls protocolを実装する
- **THEN** private endpointを使わず、公式clientと同じparticipant role / media behaviorで参加できる

#### Scenario: Botがspeakerとして参加する
- **WHEN** 専用local Bot accountが必要なCalls scopeで認可され、hostがspeaker roleを付与する
- **THEN** BotのWebRTC実装は同じMisskey media契約を通じてOpus audio trackをpublishできる

### Requirement: 第三者認可には最小権限Calls scopeを使う
システムは`read:calls`と`write:calls`を別permissionとして定義し、既存Misskey OAuth 2.0 Authorization Code + PKCE、MiAuth、明示発行API tokenを支援しなければならない（SHALL）。applicationが任意userを偽装することを許可してはならない。

#### Scenario: read-only applicationが参加を試みる
- **WHEN** `read:calls`だけを持つapplicationがroom participationまたはmedia negotiationを要求する
- **THEN** システムはparticipant / Cloudflare sessionを作成せずwrite操作を拒否する

#### Scenario: userがapplicationをrevokeする
- **WHEN** userがactive third-party connectionのtokenをrevokeする
- **THEN** システムはmedia sessionを失効させ、認可済みtrackを閉じ、以後のoperationを拒否する

### Requirement: media accessには短命で用途限定のcredentialを使う
システムはMisskey instance、room、participant、application、connection ID、connection generation、許可media kind、publish permission、expiry、nonceにbindされた短命media session credentialを発行しなければならない（SHALL）。credentialにCloudflare App Secret / TURN keyを含めたり、それらへのaccessを許可したりしてはならない。

#### Scenario: credentialを別roomで再利用する
- **WHEN** third-party clientが別room用の有効なmedia credentialを提示する
- **THEN** システムはCloudflare operationの前に拒否する

#### Scenario: listener credentialでpublishする
- **WHEN** listenerのmedia credentialを使ってmicrophone audioをpublishしようとする
- **THEN** tokenが期限内でもシステムはpublishを拒否する

#### Scenario: 長時間session中にcredential期限が近づく
- **WHEN** 認可済みconnectionのcredential expiryが近づく
- **THEN** room roleを変えず、Cloudflare secretを受け取らずに限定credentialをrefreshできる

### Requirement: Calls protocol capabilityを機械判読できる
システムは対応Calls protocol version、media kind、codec、role、limit、TURN availability、optional extension、guest participation policyを含むmachine-readable capability documentを公開しなければならない（SHALL）。

#### Scenario: clientが参加前にcompatibilityを確認する
- **WHEN** third-party clientがinstance capability documentを読む
- **THEN** participant作成前に自身のprotocol versionと必須audio featureが対応済みか判断できる

#### Scenario: 必須extensionが非対応である
- **WHEN** clientがinstance未公開のextensionを必須とする
- **THEN** Cloudflare negotiationを始めず、明示的なcompatibility結果を受け取る

### Requirement: protocol evolutionはversion付きでforward-compatibleにする
システムは公開Calls protocolへmajor / minor versionを付け、breaking behaviorにだけmajor変更を使わなければならない（SHALL）。required extensionでない未知の追加field / eventをclientが無視できる契約にしなければならない。

#### Scenario: serverがoptional event fieldを追加する
- **WHEN** serverが同じprotocol major version内でfieldを追加する
- **THEN** 古いconforming clientは既知fieldを使ってevent処理を継続する

#### Scenario: clientとserverのmajor versionが一致しない
- **WHEN** 共通対応するprotocol major versionがない
- **THEN** serverはmedia session作成前にcanonical version-mismatch errorで参加を拒否する

### Requirement: provider詳細をMisskey契約の内側へ隠す
公開protocolはmedia operationをprovider-neutralに表現し、Cloudflare session ID、track name、SDP交換詳細、provider errorをopaqueまたは正規化済みvalueとして扱わなければならない（SHALL）。それらからproviderへ直接accessできてはならない。

#### Scenario: 内部SFU providerを変更する
- **WHEN** instanceがCalls protocol versionを維持したまま内部media providerを変更する
- **THEN** conforming third-party clientは新しいprovider credentialを受け取ることなく参加を継続できる

### Requirement: 第三者clientにも順序付き認可eventを届ける
認可済みthird-party clientは公式clientと同じroom revision、event sequence、snapshot reconciliation、access revokeルールを持つ文書化済みMisskey streaming channelからCalls eventを受け取らなければならない（SHALL）。

#### Scenario: event欠落後に第三者clientが再接続する
- **WHEN** streaming再開時にevent sequence gapがある
- **THEN** clientは後続event適用前に認可済みsnapshotを取得してreconcileする

### Requirement: 第三者利用を追跡・制御できる
システムはすべてのthird-party connection / media operationをuser、applicationまたはtoken identifier、room、connection generationへ関連付け、user / application / room / instance単位の設定可能quotaを強制しなければならない（SHALL）。

#### Scenario: applicationが同時session quotaを超える
- **WHEN** applicationが設定済みquotaを超えてmedia sessionを作成しようとする
- **THEN** システムはcanonical retryable / quota errorで拒否しCloudflareを呼ばない

#### Scenario: hostが第三者participantを削除する
- **WHEN** hostがexternal clientから接続中のparticipantを削除する
- **THEN** システムは公式clientと同様にconnectionを失効しmediaを閉じる

### Requirement: 独立実装をconformance suiteで検証する
projectはauthorization、capability negotiation、room participation、WebRTC negotiation、event reconciliation、expiry、revoke、reconnect、cross-room isolationを扱うmachine-readable schema、代表wire example、自動conformance testを提供しなければならない（SHALL）。

#### Scenario: 第三者実装が互換性を検証する
- **WHEN** developerがclientに対してconformance suiteを実行する
- **THEN** suiteは各normative behaviorをpass / fail / unsupportedとして再現可能な証拠とともに報告する

### Requirement: 匿名guestとremote federationは明示的extensionとする
初期third-party contractは認可済みlocal Misskey userまたは専用local Bot accountを要求しなければならない（SHALL）。ActivityPub actor、public room URL、Cloudflare identifierの所持をparticipation authorizationとして扱ってはならない。

#### Scenario: 未認証external clientがpublic room URLを持つ
- **WHEN** clientがそのURLだけでmedia sessionを作成しようとする
- **THEN** システムは参加を拒否し、公開済みauthentication requirementを返す
