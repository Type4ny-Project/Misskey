<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

# Misskey Calls protocol 1.0

Misskey Calls is a provider-neutral audio-room protocol. Applications use the public Misskey HTTP API for commands and Cloudflare WebRTC negotiation, and the `callsRoom` WebSocket channel for authoritative room events. Provider session and track identifiers are never exposed.

## Compatibility and authentication

Call `calls/capabilities` before joining. A 1.x client requires protocol major 1, media kind `audio`, codec `opus`, and every extension it uses. Authentication may be an API token, MiAuth, or OAuth 2.0 with PKCE. The scopes are `read:calls` and `write:calls`; guests are not supported in 1.0.

## Command and event flow

1. Join with `calls/rooms/join`, fetch `calls/rooms/snapshot`, then subscribe to `callsRoom` using `{ "roomId": "..." }`.
2. Treat WebSocket events as the normal state path. Each envelope contains `roomId`, monotonically increasing `sequence`, authoritative `revision`, and `timestamp`.
3. Ignore an event whose sequence was already applied. On a sequence gap, reconnect, Redis-state loss, or unknown track, fetch a snapshot and `calls/media/reconcile` before applying later events.
4. Create a media session and retain its short-lived media credential. The credential is bound to instance, user, application, room, participant, connection generation, capability, expiry, and nonce.
5. Publish, subscribe, or renegotiate over HTTPS. Apply an answer directly; when an offer or `requiresImmediateRenegotiation` is returned, create an answer and send it to `calls/media/renegotiate`.
6. Close media and leave. A terminal room event or `revoked` event requires immediate local track stop and peer-connection teardown.

Example event:

```json
{
  "type": "participant",
  "body": {
    "roomId": "9abc...",
    "sequence": 42,
    "revision": 7,
    "timestamp": "2026-01-01T00:00:00.000Z",
    "participantId": "9def...",
    "action": "joined"
  }
}
```

## Retries and errors

Retry network failures, HTTP 429, and provider 5xx responses with bounded exponential backoff and jitter. Reconcile before retrying an operation whose result is unknown. Do not retry validation, authorization, stale revision, stale generation, or terminal-room errors without refreshing state. Clients must batch track operations within the advertised capability limit and must not reuse a media credential across rooms, applications, users, participants, or generations.

Canonical error categories are `invalid-request`, `authentication-required`, `access-denied`, `not-found`, `conflict`, `stale-revision`, `stale-generation`, `rate-limited`, `provider-unavailable`, and `terminal-room`. Error details must not contain secrets, raw SDP, ICE candidate addresses, or provider identifiers.

The independent browser example is in `packages/calls-reference-client`; it imports only the public `misskey-js` package.
