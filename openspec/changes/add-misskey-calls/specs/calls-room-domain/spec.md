## ADDED Requirements

### Requirement: アクティブルームの再利用と空ルームの終了
クライアントは同じattachmentに`scheduled`または`open`のルームが存在する場合、新規作成を送信せず既存ルームへの導線を提示しなければならない（SHALL）。サーバーは接続heartbeatのTTLを超えてもlive connectionが1件も存在しない`open`ルームを終了し、active attachment制約を解放しなければならない（SHALL）。

#### Scenario: 既存のパーソナルルームがある
- **WHEN** 開催者がCalls作成画面を開き、同じpersonal attachmentにアクティブルームがある
- **THEN** クライアントは作成操作の代わりに既存ルームへ戻る操作を表示する

#### Scenario: live connectionがないルームが残った
- **WHEN** openルームの全参加者connectionがheartbeat TTLを超えて失効する
- **THEN** サーバーはルームをendedへ遷移させ、参加者をleftとしてactive attachment制約を解放する

### Requirement: Callsルームは必ず1種類の所属先だけを持つ
システムはすべてのCallsルームを、1人のlocal host userに紐づく`personal`ルーム、または1つの既存local ChatRoomに紐づく`chatRoom`ルームのどちらかとして表現しなければならない（SHALL）。どちらも指定されていない、または両方が指定されたrecord / create requestは拒否しなければならない。

#### Scenario: personalルームを作成する
- **WHEN** 認証済みlocal userがattachment type `personal`でCallsルームを作成する
- **THEN** システムはそのuserだけに紐づき、ChatRoomには紐づかないルームを作成する

#### Scenario: ChatRoomルームを作成する
- **WHEN** 権限を持つChatRoom memberがattachment type `chatRoom`でCallsルームを作成する
- **THEN** システムはそのChatRoomに紐づくルームを作成し、作成userをhostとして記録する

#### Scenario: 曖昧な所属指定を拒否する
- **WHEN** create requestがpersonal userとChatRoomの両方を指定する、またはどちらも指定しない
- **THEN** システムはCallsルームを作成せずrequestを拒否する

### Requirement: 所属先が検索範囲と参加認可を決める
システムはattachmentと現在のaccess policyからroom discoveryとentry authorizationを決定しなければならない（SHALL）。personalルームは明示的visibilityに従って検索可能にし、ChatRoomルームは現在そのChatRoomを閲覧・参加する権限を要求しなければならない。

#### Scenario: 元ChatRoom memberが参加を試みる
- **WHEN** private ChatRoomからすでに退出したuserが、そのChatRoomのCallsルームへ参加しようとする
- **THEN** 過去に参加していてもシステムはentryを拒否する

#### Scenario: public personalルームを検索する
- **WHEN** personalルームがpublic visibilityで開催中である
- **THEN** eligible userはmedia credentialやprivate participant stateを受け取ることなくpublic metadataを検索できる

### Requirement: ルームlifecycleはMisskeyを正とする
システムはCalls room stateを`scheduled`、`open`、`ended`、`cancelled`として永続化し、`open`の間だけmedia参加を許可し、`ended`と`cancelled`をterminal stateとして扱わなければならない（SHALL）。

#### Scenario: hostがルームを開始する
- **WHEN** hostがscheduled roomを開始する
- **THEN** システムは開始時刻を記録し、stateを`open`へ変更して認可済みroom-state eventを配信する

#### Scenario: hostがルームを終了する
- **WHEN** hostがopen roomを終了する
- **THEN** システムはstateを`ended`へ変更し、終了時刻を記録し、active media参加を失効させ、room-ended eventを配信する

#### Scenario: 終了済みルームを再開しようとする
- **WHEN** clientがended roomを`open`へ戻すよう要求する
- **THEN** システムは遷移を拒否し、新しいCallsルームの作成を要求する

### Requirement: participant roleがmedia publish権限を決める
システムは各active participantへ`host`、`speaker`、`listener`のいずれか1つを割り当てなければならない（SHALL）。hostとspeakerはmicrophone audioをpublishでき、listenerはaudioを受信できるが、昇格するまでmicrophone audioをpublishしてはならない。

#### Scenario: listenerとして参加する
- **WHEN** eligible userがspeaker承認なしで参加する
- **THEN** システムはuserをlistenerとして記録し、receive-only media intentを作成する

#### Scenario: hostがlistenerを昇格させる
- **WHEN** hostがactive listenerをspeakerへ昇格させる
- **THEN** システムはmicrophone trackのpublishを許可する前にauthoritative roleを更新する

#### Scenario: listenerが直接publishを試みる
- **WHEN** listenerがmedia endpointを呼びlocal trackをpublishしようとする
- **THEN** backendは操作を拒否しCloudflareへ転送しない

### Requirement: membershipとmoderationは競合に耐える
システムは古いclient requestが失効済みaccessを復元できないよう、role変更、削除、room終了、media authorizationを現在のroom versionに対して直列化しなければならない（SHALL）。

#### Scenario: 昇格と削除が競合する
- **WHEN** 同じparticipantへの昇格要求と削除要求が同時に届く
- **THEN** システムは確定的なauthoritative結果を適用し、古いrequestでparticipationを再作成できないようにする

#### Scenario: 削除されたparticipantがcache済みrequestを再送する
- **WHEN** 削除されたparticipantが以前は有効だったpublish / subscribe requestを再送する
- **THEN** backendは現在のmembershipを再評価しrequestを拒否する

### Requirement: presenceは永続履歴とlive stateを分離する
システムはroom identity、lifecycle、participant role history、moderation actionを永続化し、browser connection、Cloudflare session ID、track ID、mute state、heartbeatを交換可能なlive-session stateとして扱わなければならない（SHALL）。

#### Scenario: browserが再接続する
- **WHEN** 認可済みparticipantがPeerConnection切断後に再接続する
- **THEN** システムはuserのroom roleを維持し、以前のlive session / track bindingを置き換える

#### Scenario: 古いlive stateが期限切れになる
- **WHEN** participantのheartbeatが設定済みgrace periodを超えて停止する
- **THEN** システムはparticipantをdisconnectedとし、room historyを削除せずlive track bindingを取り除く

### Requirement: room eventは認可された状態だけを公開する
システムはroom lifecycle、participant、role、speaking、track availability eventを、現在roomに認可されているclientだけへ配信し、reconciliationに単調増加room revisionまたはevent sequenceを使わなければならない（SHALL）。

#### Scenario: clientがevent欠落を検出する
- **WHEN** clientが期待する次番号ではないroom eventを受信する
- **THEN** clientは後続event適用前に認可済みroom snapshotを取得する

#### Scenario: subscription中にaccessが失効する
- **WHEN** attached ChatRoomへのuser accessが失効する
- **THEN** システムはCalls event配信を停止し、userのlive participationを失効させる

### Requirement: room visibilityだけではfederation参加を許可しない
初期Calls capabilityは、認証済みlocal user、またはそのuserとして正規認可された第三者clientだけにmedia参加を許可しなければならない（SHALL）。ActivityPub remote actorへCloudflare session / track controlを公開してはならない。

#### Scenario: remote userがroom contextを閲覧できる
- **WHEN** remote userがCalls roomに関連するfederated noteやprofileを閲覧できる
- **THEN** システムはそのvisibilityをmedia参加authorizationとして扱わない
