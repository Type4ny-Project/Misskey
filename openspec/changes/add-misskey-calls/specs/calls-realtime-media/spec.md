## ADDED Requirements

### Requirement: MisskeyをCloudflare control planeのtrust boundaryとする
backendはCalls media operationごとに認証し、現在のroom membership / roleを検証し、server-held credentialでCloudflare Realtime APIを呼ばなければならない（SHALL）。Realtime App Secret / TURN keyをbrowserへ公開してはならない。

#### Scenario: clientがCloudflare session作成を要求する
- **WHEN** participantがmedia negotiationを開始する
- **THEN** clientは認可済みintent / SDPをMisskey endpointへ送り、backendがCloudflare APIを呼ぶ

#### Scenario: clientが他participantのidentifierを送る
- **WHEN** clientがroom内で認可されていないsession / track identifierをclose、update、subscribeしようとする
- **THEN** backendはCloudflareを呼ぶ前にrequestを拒否する

### Requirement: 1つのlive client connectionを1つのRealtime sessionへ対応させる
システムはactive participantのclient connectionごとに1つのCloudflare Realtime Sessionと1つの`RTCPeerConnection`を対応させ、terminal connection failure後は再利用せず置き換えなければならない（SHALL）。

#### Scenario: 初回参加に成功する
- **WHEN** participantが初回WebRTC negotiationを完了する
- **THEN** システムは返されたCloudflare session IDをparticipantの現在のconnection generationへ関連付ける

#### Scenario: 古いclientと新connectionが競合する
- **WHEN** 新しいconnection generationがactiveになった後、古いclientがoperationを送る
- **THEN** backendは古いgenerationを拒否する

### Requirement: track ownershipとsubscriptionを明示する
システムはpublished trackごとにCloudflare source session ID、globally unique track name、media kind、owner participant、publication state、connection generationを保存しなければならない（SHALL）。同じCalls room内で現在認可されたspeakerのtrackだけをlistenerへsubscribeさせなければならない。

#### Scenario: speakerがmicrophone audioをpublishする
- **WHEN** 認可済みspeakerがaudio `MediaStreamTrack`をpublishする
- **THEN** システムは返されたCloudflare track identityをspeakerへ関連付け、認可済みparticipantへtrack availabilityを通知する

#### Scenario: trackが別roomに所属する
- **WHEN** participantが別Calls roomのbindingに属するremote trackを要求する
- **THEN** システムはsubscriptionを拒否する

### Requirement: Cloudflare Session / Track lifecycleに従ってnegotiationする
clientとbackendはsession create、local / remote track追加、返されたSDP適用、`requiresImmediateRenegotiation`付きresponseへの即時answer、renegotiate endpointへのanswer送信、track update / close、error後のsession reconcileを実装しなければならない（SHALL）。

#### Scenario: remote track pullにrenegotiationが必要になる
- **WHEN** Cloudflareがremote track追加後にofferと`requiresImmediateRenegotiation: true`を返す
- **THEN** clientはremote offerを適用し、answerを作成・適用し、trackをsubscribedとする前にbackendからCloudflareへanswerを送る

#### Scenario: Cloudflare operationの一部だけが失敗する
- **WHEN** batched track responseがtrack単位のerrorを含む
- **THEN** システムは確認できたtrack bindingだけをcommitし、local successを捏造せず失敗trackを報告する

### Requirement: ChromeとFirefoxで同じ標準media経路を使う
frontendはsecure contextでunprefixedな`navigator.mediaDevices.getUserMedia`、`RTCPeerConnection`、`MediaStreamTrack`、`RTCRtpTransceiver`、track eventを使わなければならない（SHALL）。User-Agent文字列で分岐したり、legacy `addStream`へ依存したり、browser挙動を強制するためSDP textを書き換えたりしてはならない。

#### Scenario: 現行Chromeで参加する
- **WHEN** 対応中の現行Chrome userがmicrophone permissionを許可する
- **THEN** 共通実装でroleに応じたjoin、publish / receive、mute、input切替、reconnect、leaveができる

#### Scenario: 現行Firefoxで参加する
- **WHEN** 対応中の現行Firefox userがmicrophone permissionを許可する
- **THEN** 同じobservable flowを完了し、同等のstate / error feedbackを受ける

#### Scenario: 必須標準APIが存在しない
- **WHEN** required standard APIが利用できない
- **THEN** frontendはroom participation record作成前にunsupported-browser resultを表示する

### Requirement: audio negotiationは共通codec baselineを使う
システムはOpus audio supportを必須とし、browserが提示するretransmission、redundancy、forward-error-correction用codec entryを維持し、hard-codeしたSDP payload listではなく`RTCRtpReceiver.getCapabilities()`からcodec preferenceを作らなければならない（SHALL）。

#### Scenario: 両browserがOpusに対応する
- **WHEN** ChromeとFirefoxがCloudflare Realtime経由でaudio negotiationする
- **THEN** SDP mungingなしでOpusを選択する

#### Scenario: codec preference APIが利用できない
- **WHEN** その他は対応済みのbrowserで`setCodecPreferences`が利用できない
- **THEN** clientはbrowser codec orderを変更せず、negotiated answerがsupported audio codecを含む場合だけ継続する

### Requirement: microphone取得はpermission-safeで再試行できる
frontendは明示的user action後にだけmicrophone accessを要求し、permission denial、deviceなし、device使用中 / hardware failure、constraint不一致、無視されたpermission promptを区別しなければならない（SHALL）。page reloadなしでretry可能にしなければならない。

#### Scenario: userがpermissionを拒否する
- **WHEN** `getUserMedia`がpermission errorでrejectする
- **THEN** frontendはmedia session外に留まり、browserに適した復旧案内を表示する

#### Scenario: permission promptに回答しない
- **WHEN** permission promiseがpendingのままである
- **THEN** UIはcancel可能なままで、participation成功と表示しない

#### Scenario: userがmicrophoneを切り替える
- **WHEN** active speakerが別の利用可能inputを選ぶ
- **THEN** clientはreplacement trackを取得し、compatibleなら`RTCRtpSender.replaceTrack`を使い、古いlocal trackをstopし、role / room membershipを維持する

### Requirement: ICE / connection recoveryを明示的に扱う
clientは`connectionState`、`iceConnectionState`、`iceGatheringState`、signaling state、track end eventを監視しなければならない（SHALL）。一時的`disconnected`は許容するが、`failed`、復旧不能negotiation error、reconnect grace period超過後は新Cloudflare sessionを作り、trackをrepublish / resubscribeしなければならない。

#### Scenario: 一時的network interruptionから復旧する
- **WHEN** ICEが`disconnected`になりgrace period内に`connected`へ戻る
- **THEN** clientはtrackを重複させず現在のsessionを維持しUIを更新する

#### Scenario: PeerConnectionがfailedになる
- **WHEN** PeerConnectionが`failed`へ遷移する
- **THEN** clientはcloseし、connection generationを増やし、新sessionを作り、認可済みlocal audioをrepublishし、authoritative room track snapshotへresubscribeする

#### Scenario: Cloudflare inactivity timeoutでtrackが消える
- **WHEN** provider inactivity timeoutによりtrackがgarbage-collectedされる
- **THEN** システムは古いbindingを削除し、advertiseを続けずrepublish / resubscribeを要求する

### Requirement: TURN credentialは短命で更新可能にする
TURN有効時、backendはexpected room durationに収まるTTLを持つuser単位の短命Cloudflare TURN credentialを生成し、必要に応じてbrowser-incompatibleなport 53 URLを除外し、expiry前に`RTCPeerConnection.setConfiguration`でrefreshできるようにしなければならない（SHALL）。

#### Scenario: 制限networkでrelayが必要になる
- **WHEN** direct ICE connectivityを確立できず有効なTURN credentialが設定されている
- **THEN** Chrome / FirefoxはTURN keyを受け取らず、対応UDP / TCP / TLS TURN URLを利用できる

#### Scenario: credentialの期限が近づく
- **WHEN** active roomが現在のTURN credentialより長く続く見込みである
- **THEN** clientはbackendからreplacementを取得し、expiry前にPeerConnection configurationを更新する

### Requirement: mute / role変更で未認可mediaを停止する
local muteはmicrophone transmissionを即時停止し、demotion、removal、logout、room endはauthoritative Cloudflare publicationをcloseして以後のmedia operationを失効させなければならない（SHALL）。

#### Scenario: speakerがlistenerへ降格する
- **WHEN** speakerがlistenerになる
- **THEN** clientはlocal microphone publicationを停止し、clientが協力しなくてもbackendがpublished trackをcloseまたは無効化する

#### Scenario: userがlocal muteする
- **WHEN** speakerがmuteを押す
- **THEN** speaker roleを変えず、UI / room eventでmuted stateを示し、outgoing audioを即時停止する

### Requirement: sensitive dataを漏らさずmedia failureを観測できる
システムはroom ID、participant-local identifier、connection generation、Cloudflare operation、client実装 / browser family / version、negotiation state、ICE candidate type、selected codec、RTT、packet loss、jitter、failure categoryのstructured metric / logを記録しなければならない（SHALL）。SDP body、secret、TURN credential、raw IP address、microphone contentは除外しなければならない。

#### Scenario: cross-browser connectionが失敗する
- **WHEN** participantがconnected stateへ到達できない
- **THEN** operatorはmedia / credentialへaccessせず、permission、signaling、Cloudflare API、ICE、TURN、codec、timeout failureを区別できる

### Requirement: provider limitを明示的に処理する
実装は安全な範囲でtrack operationをbatchし、文書化済みper-session API rate / per-call track count以下を維持し、provider timeoutをrecoverable state transitionとして扱い、Cloudflare egress cost推定に必要なusageを公開しなければならない（SHALL）。

#### Scenario: 多数speakerが同時に変化する
- **WHEN** track availability変更が1 provider callまたは安全request rateを超える
- **THEN** システムは現在のprovider limitを超えず認可済みoperationをqueue / batchする

#### Scenario: Cloudflare limitが変更される
- **WHEN** deployment validationで実装設定と異なるdocumented limitを検出する
- **THEN** stale valueを黙って仮定せず、設定とtestがreviewされるまでdeploymentをblockする
