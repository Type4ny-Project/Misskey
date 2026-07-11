<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

# Misskey Calls protocol 1.0

Misskey Calls is a provider-neutral audio-room protocol. Applications use the public Misskey HTTP API for commands and Cloudflare WebRTC negotiation, and the `callsRoom` WebSocket channel for authoritative room events. Provider session and track identifiers are never exposed.

## Compatibility and authentication

Call `calls/capabilities` before joining. A 1.x client requires protocol major 1, media kind `audio`, codec `opus`, and every extension it uses. Authentication may be an API token, MiAuth, or OAuth 2.0 with PKCE. The scopes are `read:calls` and `write:calls`; guests are not supported in 1.0.

## Command and event flow

1. Join with `calls/rooms/join`, fetch `calls/rooms/show`, then subscribe to `callsRoom` using `{ "roomId": "..." }`.
2. Treat WebSocket events as the normal state path. Each event body contains a monotonically increasing `sequence`, authoritative `roomRevision`, and `occurredAt` timestamp. The subscribed channel identifies the room.
3. Ignore an event whose sequence and room revision were already applied. On a forward gap, or when a lower sequence arrives with a newer room revision after Redis-state loss, fetch a snapshot and `calls/media/reconcile` before applying later events.
4. Create a media session and retain its short-lived media credential. The credential is bound to instance, user, application, room, participant, connection generation, capability, expiry, and nonce.
5. Publish, subscribe, or renegotiate over HTTPS. Apply an answer directly; when an offer or `requiresImmediateRenegotiation` is returned, create an answer and send it to `calls/media/renegotiate`.
6. Close media and leave. A terminal room event or `revoked` event requires immediate local track stop and peer-connection teardown.

If a heartbeat detects lost live state, the server emits `revoked` with reason `stale-generation`. Tear down the old peer connection and create a new media session/generation before republishing or resubscribing. Other revoke reasons are terminal for the current access decision and must not be retried without rejoining or refreshing authorization.

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

The independent browser example is in `packages/calls-reference-client`; it imports only the public `misskey-js` package.

## Instance operation

Calls is disabled unless `cloudflareRealtime.enabled` is true. Keep the SFU App Secret and optional TURN API token only in the server configuration or secret manager; never expose them to the frontend. The public API returns only short-lived, user-bound media credentials and short-lived TURN credentials.

Use a dedicated non-production SFU App and TURN token for staging. Configure `turn.tokenId` with the dashboard's **Turn Token ID** and `turn.apiToken` with that token's API token. RealtimeKit App IDs and API tokens are separate credentials and cannot replace the low-level Realtime SFU App ID / App Secret or TURN token. Before enabling Calls, confirm the current provider limits and record the review date in the deployment runbook. Start with the defaults of 10 sessions and 8 published tracks per third-party application, then adjust from observed usage. Add a compromised or abusive application ID to `disabledApplicationIds` to stop new sessions immediately.

For secret rotation, add the replacement secret to the deployment secret store, deploy all application nodes, verify session creation, and then revoke the old provider secret. TURN credentials are short-lived and are revoked on participant removal, role loss, logout, ChatRoom access loss, or room termination. Do not paste production credentials into issue, PR, browser, or client-side configuration.

The code-first rollback is `cloudflareRealtime.enabled: false`. This rejects new room and media operations while existing room state remains in the database. During an incident, disable the feature, add affected application IDs to the kill switch, terminate affected Calls rooms, and verify provider tracks have been closed before re-enabling.

## Observability and alerts

Provider telemetry records only operation name, HTTP status, duration, outcome, normalized category, and retryability. Browser stats normalize codec, candidate type and protocol, bitrate, packet loss, jitter, RTT, and audio level; candidate addresses, raw SDP, media credentials, provider secrets, and raw IP addresses must never be logged.

Dashboards should split join success and latency, first remote audio, disconnect/recovery, provider errors, relay use, and estimated egress by browser family and application identity. Alert on a sustained join-success drop, p95 join latency regression, provider-unavailable spike, repeated reconnect failures, or unexpected relay/egress growth. Exact thresholds are deployment-specific and should be set from the initial internal/allowlist baseline.
