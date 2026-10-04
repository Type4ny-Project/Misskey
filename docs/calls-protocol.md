<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

# Misskey Calls protocol 1.0

Misskey Calls is a provider-neutral audio/video room protocol. Applications use the public Misskey HTTP API for commands and Cloudflare WebRTC negotiation, and the `callsRoom` WebSocket channel for authoritative room events. Provider session and track identifiers are never exposed.

## Compatibility and authentication

Call `calls/capabilities` before joining. A 1.x client requires protocol major 1, media kind `audio`, codec `opus`, and every extension it uses. Authentication may be an API token, MiAuth, or OAuth 2.0 with PKCE. The scopes are `read:calls` and `write:calls`; guests are not supported in 1.0.

## Command and event flow

1. Join with `calls/rooms/join`, retain the returned provisional participant, fetch `calls/rooms/show`, then subscribe to `callsRoom` using `{ "roomId": "..." }`. Public snapshots and user Calls presence exclude participants whose media connection is not ready.
2. Treat WebSocket events as the normal state path. Each event body contains a monotonically increasing `sequence`, authoritative `roomRevision`, and `occurredAt` timestamp. The subscribed channel identifies the room.
3. Ignore an event whose sequence and room revision were already applied. On a forward gap, or when a lower sequence arrives with a newer room revision after Redis-state loss, fetch a snapshot and `calls/media/reconcile` before applying later events.
4. Create a media session and retain its short-lived media credential. The credential is bound to instance, user, application, room, participant, connection generation, capability, expiry, and nonce.
5. Publish, subscribe, or renegotiate over HTTPS. Apply an answer directly; when an offer or `requiresImmediateRenegotiation` is returned, create an answer and send it to `calls/media/renegotiate`.
6. After initial negotiation, wait for the peer connection to connect and remote audio playback to start. Send `ready` on `callsRoom` with `{ "connectionId": "...", "generation": 1 }`. An empty listening room needs no transport or remote playback. If autoplay is blocked, wait for successful user-initiated playback before sending `ready`. The server validates the current bound media session, then emits the participant `joined` event and includes the participant in public snapshots and presence. Each new media generation must send `ready`; repeated commands for the same generation are idempotent.
7. Close media and leave. A terminal room event or `revoked` event requires immediate local track stop and peer-connection teardown.

If a heartbeat detects lost live state, the server emits `revoked` with reason `stale-generation`. Tear down the old peer connection and create a new media session/generation before republishing or resubscribing. Other revoke reasons are terminal for the current access decision and must not be retried without rejoining or refreshing authorization.

Protocol 1.1 supports camera and screen video alongside microphone audio. Publish `mediaSource: microphone | camera | screen` (omitting it selects microphone). Camera and screen map to `mediaKind: video`; the speaker/host authorization applies to all three sources. Reconcile returns each publication's media kind and source. Subscribe returns `subscriptions: [{ publicationId, mid }]` for successful tracks; associate incoming WebRTC transceiver mids with these public publication IDs before applying the returned SDP. Provider identifiers remain private. Stop capture and close the publication on toggle-off, browser capture-ended, or leaving; camera and screen capture must only begin after a user action.

Only one device may hold a participant's media connection. A fresh `calls/media/session/create` request returns `CALLS_CONNECTION_EXISTS` if another device is connected. Ask the user before retrying with `replaceExisting: true`. Recovery requests must retain their `connectionId` and send `expectedGeneration`; they cannot replace another device. A `revoked` event with reason `replaced` addresses the old `connectionId` and `generation`. That device must stop locally without calling room leave or end; other connections ignore the event. Include the current `connectionId` and `generation` in explicit room leave/end requests so delayed actions from an old device cannot affect the new connection. Only an explicit room end closes the room and revokes all media. A host leave, page close, reload, or lost connection keeps the room open so the host can rejoin. Hosts and other participants share the reload reconnect flow; after its short-lived candidate expires, the host can still join the existing open room.

The host can change a scheduled or open room's title with `calls/rooms/update-title` (`roomId`, `title`, `expectedRevision`). Titles use the same 1–256 character limit and metadata sanitization as creation. Successful changes emit a `title` event containing the new `title` on `callsRoom`, and an `updated` event with action `title` on `callsRooms`.

Example event:

```json
{
  "type": "participant",
  "body": {
    "sequence": 42,
    "roomRevision": 7,
    "occurredAt": "2026-01-01T00:00:00.000Z",
    "participantId": "9def...",
    "action": "joined"
  }
}
```

## Retries and errors

Retry network failures, HTTP 429, and provider 5xx responses with bounded exponential backoff and jitter. Reconcile before retrying an operation whose result is unknown. Do not retry validation, authorization, stale revision, stale generation, or terminal-room errors without refreshing state. Clients must batch track operations within the advertised capability limit and must not reuse a media credential across rooms, applications, users, participants, or generations.

Canonical error categories are `invalid-request`, `authentication-required`, `access-denied`, `not-found`, `conflict`, `stale-revision`, `stale-generation`, `rate-limited`, `provider-unavailable`, and `terminal-room`. Error details must not contain secrets, raw SDP, ICE candidate addresses, or provider identifiers.

Clients must implement the `ready` command to appear as participants. Reload existing clients after deploying this change.

The independent browser example is in `packages/calls-reference-client`; it imports only the public `misskey-js` package. Its browser integration must call `confirmReady()` after completing transport and audio playback setup, including after recovery.

## Instance operation

Calls is disabled unless `cloudflareRealtime.enabled` is true. Keep the SFU App Secret and optional TURN API token only in the server configuration or secret manager; never expose them to the frontend. The public API returns only short-lived, user-bound media credentials and short-lived TURN credentials.

Use a dedicated non-production SFU App and TURN token for staging. Configure `turn.tokenId` with the dashboard's **Turn Token ID** and `turn.apiToken` with that token's API token. RealtimeKit App IDs and API tokens are separate credentials and cannot replace the low-level Realtime SFU App ID / App Secret or TURN token. Before enabling Calls, confirm the current provider limits and record the review date in the deployment runbook. Start with the defaults of 10 sessions and 8 published tracks per third-party application, then adjust from observed usage. Add a compromised or abusive application ID to `disabledApplicationIds` to stop new sessions immediately.

For secret rotation, add the replacement secret to the deployment secret store, deploy all application nodes, verify session creation, and then revoke the old provider secret. TURN credentials are short-lived and are revoked on participant removal, role loss, logout, ChatRoom access loss, or room termination. Do not paste production credentials into issue, PR, browser, or client-side configuration.

The code-first rollback is `cloudflareRealtime.enabled: false`. This rejects new room and media operations while existing room state remains in the database. During an incident, disable the feature, add affected application IDs to the kill switch, terminate affected Calls rooms, and verify provider tracks have been closed before re-enabling.

## Observability and alerts

Provider telemetry records only operation name, HTTP status, duration, outcome, normalized category, and retryability. Browser stats normalize codec, candidate type and protocol, bitrate, packet loss, jitter, RTT, and audio level; candidate addresses, raw SDP, media credentials, provider secrets, and raw IP addresses must never be logged.

Dashboards should split join success and latency, first remote audio, disconnect/recovery, provider errors, relay use, and estimated egress by browser family and application identity. Alert on a sustained join-success drop, p95 join latency regression, provider-unavailable spike, repeated reconnect failures, or unexpected relay/egress growth. Exact thresholds are deployment-specific and should be set from the initial internal/allowlist baseline.

Room owners can appoint or dismiss an active non-host participant through `calls/rooms/set-moderator`. Room `moderatorUserIds` persist for the room lifetime. A VC moderator must be an active participant with current room access to kick a non-host participant or mute a speaker through `calls/rooms/mute-participant`. Muting publishes a `mute` event that disables the speaker's microphone; the speaker can unmute themselves. Room owners and VC moderators can also stop a speaker's camera or screen share through `calls/rooms/stop-participant-video`. Only the selected source's provider tracks are closed; `videoStopped` events carry the participant ID and media source, trigger reconciliation, and stop local capture. The event is sent even when a retry finds no remaining publication, so notification failures can be retried. Speakers can restart the source themselves. This permission does not allow changing speaker roles, assigning moderators, or ending the room. Moderator changes publish a `participant` event with action `updated` so clients refresh their room snapshot.

Only the current host can transfer an open room to an active non-host participant through `calls/rooms/transfer-host` (`roomId`, `participantId`, `expectedRevision`). Ownership and both participant roles change in one transaction: the target becomes host and the previous host remains a speaker, so their later exit does not end the room. The target's moderator assignment and speaker request are cleared. Existing participants retain access to non-public rooms; follower visibility subsequently follows the new owner. A target who already owns an active personal room is rejected with `CALLS_ACTIVE_ATTACHMENT`. A `participant` event refreshes the room and participant snapshot, and the host timeout is renewed.

Host transfer checks the target’s current Calls participation permission. Its moderation log records the original actor, target and committed revision. Repeating the same request with the original `expectedRevision` can resend notifications after a committed transfer without changing ownership again, provided the recorded target is still host. Clients refresh the committed state on an ambiguous failure and retry that notification once. The previous host receives a role update, and the new host’s participant update refreshes the room snapshot for viewers.
