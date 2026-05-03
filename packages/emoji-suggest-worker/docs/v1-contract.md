# Emoji Suggest Worker v1 Contract

This document freezes the v1 product, API, cache, privacy, and cost contracts for the emoji recommendation architecture. Downstream backend, admin, frontend, and Worker implementation tasks must implement this contract rather than making additional product decisions.

Pricing facts were verified from official Cloudflare documentation on 2026-05-03. This task did not call live or paid Cloudflare APIs.

## v1 Scope

- Backend proxy is mandatory: the frontend calls the Misskey backend, and the backend calls the Worker. The frontend never calls the Worker directly and never receives Worker secrets.
- Vectorize is the primary emoji nearest-neighbor index.
- R2 is the source-of-truth/export layer for versioned emoji index artifacts.
- KV is the online response cache.
- D1 is optional for control-plane metadata only and is not on the online suggestion hot path.
- Queues are optional for future offline build/import flows and are not on the online suggestion hot path.
- Online v1 performs embedding-only inference. There is no online LLM, Gemini, Workers AI intent classifier, generative explanation, or chat completion path.
- v1 has no per-user personalization, user preference storage, reaction adoption learning, or user-level feedback loop.
- The frontend target is a 300 ms p95 UI timeout. Backend and Worker fallback behavior must preserve note posting if suggestions are slow or unavailable.

## Eligibility Rules

A note is eligible for emoji suggestions only when this exact predicate is true:

```ts
visibility === 'public' && localOnly !== true
```

Rules:

- `visibility` values other than `public` are ineligible.
- `localOnly === true` is ineligible even when `visibility === 'public'`.
- Missing `localOnly` is treated as not local-only for this predicate.
- The backend must enforce eligibility before calling the Worker.
- The Worker must independently reject requests whose eligibility fields do not satisfy the predicate.
- Ineligible notes return an empty suggestion set with reason `ineligible`; they do not call Workers AI or Vectorize and do not write cache entries.

## Content Warning And Text Normalization

The backend derives the transient text sent to the Worker with these v1 rules:

- If `cw` exists and is not empty after trimming, embed `cw` text plus public tags and omit hidden body text in v1.
- If `cw` is absent or empty, embed the visible note body text plus public tags.
- Public tags are appended as plain tokens without `#` expansion beyond the provided tag text.
- Poll choices, attachments, filenames, alt text, mentions, quoted note bodies, renote bodies, and reply parent bodies are excluded from v1 embedding text.
- Emoji shortcodes in the note text remain as their shortcode text during normalization.
- URLs are replaced with the literal token `[url]`.
- Hostnames, handles, and account identifiers are not added by the suggestion pipeline.
- Unicode is normalized with NFKC, whitespace collapses to a single ASCII space, and leading/trailing whitespace is trimmed.
- Text is lowercased only when the selected embedding model documentation recommends lowercasing; otherwise original case after NFKC is retained. The normalization schema identifier records the selected behavior.
- The normalized embedding input is capped at 512 Unicode scalar values before embedding. Truncation occurs after CW/body selection and tag append.
- Empty normalized embedding text returns fallback reason `emptyText` without Worker AI or Vectorize calls.

The first v1 normalization schema identifier is `emoji-suggest-normalization-v1`.

## Privacy And Persistence Rules

Raw note text is transient request memory only. Raw note text must not be persisted in KV, D1, R2, logs, analytics, traces, evidence files, exception messages, metric labels, cache keys, object names, or queue payloads.

Privacy requirements:

- Backend request logs must record only coarse fields: eligibility result, budget mode, cache hit/miss, result count, latency bucket, model version, emoji index version, and failure reason.
- Worker logs must never include `text`, `cw`, `normalizedText`, `embeddingText`, raw request bodies, or full cache keys.
- Evidence files and documentation examples use fixture strings only.
- KV stores only cached suggestion responses keyed by HMAC-derived text identity.
- R2 stores versioned emoji index artifacts and metadata; it never stores user note text or per-note embeddings.
- D1, if used, stores control-plane rows such as active `emojiIndexVersion`, rollout state, and budget counters. It never stores raw note text, normalized text, per-user data, or note identifiers.
- Analytics and traces may include hashed cache key prefixes no longer than 12 hex characters, never the full HMAC value.
- Worker authentication uses a secret configured outside source control. This document uses redacted prose labels only and does not define real values.

## Cache Key Contract

The backend and Worker derive the same cache identity from normalized transient text and versioned parameters. The canonical cache key fields are:

- `instanceId`: stable instance-level identifier configured by the backend, not a user or account identifier.
- `normalizedTextHmac`: HMAC-SHA-256 of normalized embedding text using a server-side secret; raw text is never included in the key.
- `normalizationSchema`: versioned normalization schema identifier, initially `emoji-suggest-normalization-v1`.
- `modelVersion`: exact embedding model identifier plus any local version suffix.
- `emojiIndexVersion`: immutable emoji index artifact version loaded from R2 and active in Vectorize.
- `locale`: normalized BCP 47 locale selected by backend, or `und` when unknown.
- `language`: detected or user-selected ISO language code, or `und` when unknown.
- `maxResults`: integer result limit after backend bounds enforcement.
- `resultShapeVersion`: response shape identifier, initially `emoji-suggest-result-v1`.

Canonical key serialization:

```json
{
  "instanceId": "fixture-instance",
  "normalizedTextHmac": "hmac-sha256:fixturehex0123456789abcdef",
  "normalizationSchema": "emoji-suggest-normalization-v1",
  "modelVersion": "@cf/baai/bge-small-en-v1.5:v1",
  "emojiIndexVersion": "emoji-index-fixture-2026-05-03",
  "locale": "en-US",
  "language": "en",
  "maxResults": 8,
  "resultShapeVersion": "emoji-suggest-result-v1"
}
```

KV key format is `emoji-suggest:v1:{instanceId}:{emojiIndexVersion}:{modelVersion}:{normalizationSchema}:{locale}:{language}:{maxResults}:{resultShapeVersion}:{normalizedTextHmac}`. Implementations must not log this full string because it contains the full HMAC.

Recommended KV TTL is 7 days. Any change to `modelVersion`, `emojiIndexVersion`, `normalizationSchema`, `maxResults`, or `resultShapeVersion` naturally bypasses old cache entries.

## Misskey Backend API Contract

Endpoint: `POST /api/emoji-suggest/recommend`

Caller: authenticated frontend session or authorized internal UI call handled by the Misskey backend.

Backend responsibilities:

- Enforce the eligibility rule before Worker calls.
- Normalize text according to this contract.
- Enforce admin-configured budget mode and request timeout.
- Compute `normalizedTextHmac` with a backend-held secret.
- Proxy eligible live/cache requests to the Worker with Worker authentication.
- Strip Worker-only diagnostic fields before returning to the frontend.
- Return an empty list on ineligible, disabled, budget-exceeded, timeout, Worker error, or empty-text fallback.

Request schema:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `note.visibility` | string | yes | Misskey visibility string; only `public` is eligible. |
| `note.localOnly` | boolean | no | `true` makes request ineligible. |
| `note.text` | string | no | Fixture/raw note body in request memory only; omitted from persistence and logs. |
| `note.cw` | string or null | no | When non-empty, used instead of body text with public tags. |
| `note.tags` | string[] | no | Public tag strings only. |
| `locale` | string | no | BCP 47 locale; backend normalizes or uses `und`. |
| `language` | string | no | ISO language code; backend normalizes or uses `und`. |
| `maxResults` | number | no | Integer 1 through 16; default 8. |
| `clientContext.surface` | string | no | `noteForm` for v1. |

Backend request example using fixture text only:

```json
{
  "note": {
    "visibility": "public",
    "localOnly": false,
    "text": "fixture public note about tea",
    "cw": null,
    "tags": ["fixture-tea"]
  },
  "locale": "en-US",
  "language": "en",
  "maxResults": 8,
  "clientContext": {
    "surface": "noteForm"
  }
}
```

Backend response schema:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `items` | object[] | yes | Ordered suggestions, length 0 through `maxResults`. |
| `items[].name` | string | yes | Custom emoji name without surrounding colons. |
| `items[].score` | number | yes | Normalized score from 0 through 1. |
| `items[].aliases` | string[] | yes | Public aliases available to frontend. |
| `items[].category` | string or null | yes | Public emoji category when available. |
| `items[].url` | string | yes | Public custom emoji asset URL generated by backend. |
| `source` | string | yes | `cache`, `live`, or `fallback`. |
| `reason` | string or null | yes | Fallback reason or null. |
| `emojiIndexVersion` | string or null | yes | Active index version when available. |
| `modelVersion` | string or null | yes | Active model version when available. |
| `durationMs` | number | yes | Backend-observed duration rounded to integer milliseconds. |

Backend response example:

```json
{
  "items": [
    {
      "name": "fixture_tea",
      "score": 0.91,
      "aliases": ["fixture", "tea"],
      "category": "fixture",
      "url": "https://example.invalid/emoji/fixture_tea.webp"
    },
    {
      "name": "fixture_cup",
      "score": 0.84,
      "aliases": ["fixture", "cup"],
      "category": "fixture",
      "url": "https://example.invalid/emoji/fixture_cup.webp"
    }
  ],
  "source": "live",
  "reason": null,
  "emojiIndexVersion": "emoji-index-fixture-2026-05-03",
  "modelVersion": "@cf/baai/bge-small-en-v1.5:v1",
  "durationMs": 126
}
```

Fallback backend response example:

```json
{
  "items": [],
  "source": "fallback",
  "reason": "budgetExceeded",
  "emojiIndexVersion": "emoji-index-fixture-2026-05-03",
  "modelVersion": "@cf/baai/bge-small-en-v1.5:v1",
  "durationMs": 24
}
```

## Worker API Contract

Endpoint: `POST /v1/suggest`

Caller: Misskey backend only. Worker requests require backend-to-Worker authentication configured outside source control.

Worker request schema:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `schemaVersion` | string | yes | `emoji-suggest-worker-request-v1`. |
| `requestId` | string | yes | Random request correlation ID; not a user or note ID. |
| `instanceId` | string | yes | Stable instance identifier. |
| `eligibility.visibility` | string | yes | Must be `public` for live/cache work. |
| `eligibility.localOnly` | boolean | no | Must not be `true` for live/cache work. |
| `normalizedText` | string | yes | Transient normalized embedding input; never persisted or logged. |
| `normalizedTextHmac` | string | yes | HMAC identity for cache key. |
| `normalizationSchema` | string | yes | `emoji-suggest-normalization-v1`. |
| `modelVersion` | string | yes | Embedding model version. |
| `emojiIndexVersion` | string | yes | Active Vectorize index artifact version. |
| `locale` | string | yes | Normalized locale or `und`. |
| `language` | string | yes | Normalized language or `und`. |
| `maxResults` | number | yes | Integer 1 through 16. |
| `budgetMode` | string | yes | `disabled`, `cacheOnly`, or `live`. |
| `deadlineMs` | number | yes | Remaining backend deadline budget. |

Worker request example using fixture text only:

```json
{
  "schemaVersion": "emoji-suggest-worker-request-v1",
  "requestId": "fixture-request-001",
  "instanceId": "fixture-instance",
  "eligibility": {
    "visibility": "public",
    "localOnly": false
  },
  "normalizedText": "fixture public note about tea fixture-tea",
  "normalizedTextHmac": "hmac-sha256:fixturehex0123456789abcdef",
  "normalizationSchema": "emoji-suggest-normalization-v1",
  "modelVersion": "@cf/baai/bge-small-en-v1.5:v1",
  "emojiIndexVersion": "emoji-index-fixture-2026-05-03",
  "locale": "en-US",
  "language": "en",
  "maxResults": 8,
  "budgetMode": "live",
  "deadlineMs": 220
}
```

Worker response schema:

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `schemaVersion` | string | yes | `emoji-suggest-worker-response-v1`. |
| `items` | object[] | yes | Ordered suggestions, length 0 through `maxResults`. |
| `items[].name` | string | yes | Custom emoji name without surrounding colons. |
| `items[].score` | number | yes | Normalized score from 0 through 1. |
| `items[].aliases` | string[] | yes | Public aliases from emoji index. |
| `items[].category` | string or null | yes | Public category from emoji index. |
| `source` | string | yes | `cache`, `live`, or `fallback`. |
| `reason` | string or null | yes | Fallback reason or null. |
| `cacheKeyPrefix` | string or null | yes | Optional 12-hex-character diagnostic prefix only. |
| `emojiIndexVersion` | string | yes | Index version used. |
| `modelVersion` | string | yes | Model version used. |
| `timings` | object | yes | Rounded timing fields with no text values. |

Worker response example:

```json
{
  "schemaVersion": "emoji-suggest-worker-response-v1",
  "items": [
    {
      "name": "fixture_tea",
      "score": 0.91,
      "aliases": ["fixture", "tea"],
      "category": "fixture"
    },
    {
      "name": "fixture_cup",
      "score": 0.84,
      "aliases": ["fixture", "cup"],
      "category": "fixture"
    }
  ],
  "source": "cache",
  "reason": null,
  "cacheKeyPrefix": "abc123def456",
  "emojiIndexVersion": "emoji-index-fixture-2026-05-03",
  "modelVersion": "@cf/baai/bge-small-en-v1.5:v1",
  "timings": {
    "kvReadMs": 9,
    "embeddingMs": 0,
    "vectorizeMs": 0,
    "totalMs": 18
  }
}
```

## Budget Modes And Fallback Behavior

Admin-configured budget mode controls online cost exposure:

| Mode | Behavior | Costing behavior | User-facing response |
| --- | --- | --- | --- |
| `disabled` | Backend returns immediately without calling Worker. | No Worker, KV, Workers AI, or Vectorize online usage. | Empty `items`, `source: "fallback"`, `reason: "disabled"`. |
| `cacheOnly` | Backend may call Worker; Worker reads KV and returns cached results only. | Worker request and KV read only; no Workers AI or Vectorize query. | Cache hit returns cached items; cache miss returns empty `items`, `source: "fallback"`, `reason: "cacheMiss"`. |
| `live` | Worker reads KV, and on miss embeds normalized text, queries Vectorize, writes KV, and returns live results. | Worker request, KV read, Workers AI embedding tokens, Vectorize queried dimensions, KV write on miss. | Live result on success; empty fallback for exceeded budgets, timeout, unavailable dependencies, or empty text. |

Budget-exceeded behavior:

- Budget checks run before any paid online operation.
- When monthly or daily soft budgets are exceeded in `live`, the Worker must behave like `cacheOnly` for misses and return reason `budgetExceeded`.
- When budget state cannot be read, v1 fails closed to `cacheOnly` behavior and returns reason `budgetStateUnavailable` on misses.
- Timeouts return reason `timeout` and must not block note posting.
- Worker auth failures return backend fallback reason `workerUnauthorized`; the frontend receives no secret details.
- Dependency failures return reason `workerUnavailable`, `embeddingUnavailable`, `vectorizeUnavailable`, or `cacheUnavailable` as appropriate.

## Cost Model

Pricing sources verified from official Cloudflare documentation on 2026-05-03:

- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Vectorize pricing: https://developers.cloudflare.com/vectorize/platform/pricing/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
- KV pricing: https://developers.cloudflare.com/kv/platform/pricing/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/

Pricing facts used for v1 examples:

- Workers Paid minimum is $5/month. Standard includes 10M Worker requests/month and 30M CPU ms/month, then $0.30/M requests and $0.02/M CPU ms. Free has 100k requests/day and 10 ms CPU per invocation.
- Workers AI includes 10,000 free neurons/day. Paid overage is $0.011/1,000 neurons. Embedding examples: `@cf/baai/bge-small-en-v1.5` at $0.020/M input tokens, `@cf/baai/bge-m3` at $0.012/M input tokens, and `@cf/qwen/qwen3-embedding-0.6b` at $0.012/M input tokens.
- Vectorize paid includes the first 50M queried vector dimensions/month plus $0.01/M after, and the first 10M stored vector dimensions plus $0.05/100M after. The query formula includes `(queried vectors + stored vectors) * dimensions`.
- Vectorize has a paid-plan caveat: it is paid-plan-only per the Workers pricing page, so v1 production live mode assumes a paid Workers account.
- R2 Standard free tier includes 10 GB-month storage, 1M Class A operations/month, 10M Class B operations/month, and free egress. Paid Standard is $0.015/GB-month, Class A $4.50/M, and Class B $0.36/M.
- KV free includes 100k reads/day, 1k writes/day, and 1 GB. Paid includes 10M reads/month plus $0.50/M, 1M writes/month plus $5/M, and 1 GB plus $0.50/GB-month.
- D1 free includes 5M rows read/day, 100k rows written/day, and 5 GB. Paid includes 25B rows read/month plus $0.001/M, 50M rows written/month plus $1/M, and the first 5 GB plus $0.75/GB-month. D1 is optional/control-plane only for v1.
- Queues free includes 10k operations/day. Paid includes 1M operations/month plus $0.40/M. Typical message delivery is 3 operations; queues are not required on the online hot path.

Emoji index size:

- 15,422 custom emojis at 384 dimensions store about 5.92M vector dimensions.
- 15,422 custom emojis at 768 dimensions store about 11.84M vector dimensions.
- The 384-dimensional index fits within the paid included 10M stored Vectorize dimensions. The 768-dimensional index slightly exceeds that included storage, with small overage under the documented rate.

Traffic scenarios for cache-heavy operation with approximately 15,422 custom emojis:

| Scenario | Monthly backend suggestion calls | Cache hit rate | Live misses | Approximate paid-operation profile |
| --- | ---: | ---: | ---: | --- |
| Small instance cache-heavy | 100,000 | 90% | 10,000 | Worker requests and KV reads are within paid included Workers/KV monthly allowances; Workers AI embedding token usage is limited to misses; Vectorize queried dimensions at 384 dimensions are about 59M using `(15,422 + 1) * 384 * 10,000`, slightly above the first 50M queried dimensions. |
| Medium instance cache-heavy | 1,000,000 | 95% | 50,000 | Worker requests and KV reads remain within included paid allowances; KV writes are about 50,000; Workers AI token costs scale only with misses; Vectorize queried dimensions at 384 dimensions are about 296M, so queried-dimension overage is the main variable cost. |
| Large instance cache-heavy | 10,000,000 | 98% | 200,000 | Worker requests are near the 10M included paid allowance; KV reads are near the 10M included paid allowance; KV writes are about 200,000; Vectorize queried dimensions at 384 dimensions are about 1.18B, making Vectorize query volume the primary cost guardrail. |
| Cache-only degraded mode | 1,000,000 | 95% | 50,000 cache misses | No Workers AI or Vectorize usage occurs; cache hits serve from KV and misses return fallback. This mode is the budget-exceeded behavior when live costs are disabled. |

Cost guardrails:

- Prefer 384-dimensional embeddings for v1 unless quality evaluation in a later task explicitly changes `modelVersion` and cost budgets.
- Use `cacheOnly` during initial rollout to prevalidate backend/frontend integration without Workers AI or Vectorize query costs.
- Use `live` only after active `emojiIndexVersion`, `modelVersion`, and monthly budget ceilings are configured.
- Treat Vectorize queried dimensions as the dominant cost variable for cache misses because every live miss queries the full 15,422-emoji index unless implementation later narrows candidate sets under a new contract version.

## Downstream Implementation Notes

Backend tasks:

- Add admin meta fields for Worker URL, Worker secret presence, budget mode, monthly budget ceiling, `modelVersion`, `emojiIndexVersion`, timeout, and enable flag through `admin/meta`, `admin/update-meta`, `MetaService`, and public meta only where appropriate.
- Keep Worker secret write-only/masked for non-root admin views and never expose it in public meta.
- Implement the backend endpoint as the only frontend-accessible suggestion surface.
- Enforce `visibility === 'public' && localOnly !== true` before Worker calls.
- Apply CW/text normalization before computing HMAC and before Worker request.
- Use `fetchInstance(true)` after admin setting saves so frontend cached instance data refreshes.

Admin tasks:

- Present budget modes exactly as `disabled`, `cacheOnly`, and `live`.
- Explain that `live` requires paid-plan-compatible Cloudflare resources because Vectorize is paid-plan-only.
- Show active `modelVersion` and `emojiIndexVersion` as explicit configuration values.
- Provide a safe connectivity test that sends fixture text only.

Frontend tasks:

- Call only the Misskey backend endpoint.
- Use a 300 ms UI timeout target and fall back to no suggestions without blocking posting.
- Do not persist suggestion inputs in local storage, IndexedDB, telemetry, or client logs.
- Render empty suggestion results as a non-error state.

Worker tasks:

- Authenticate backend requests before parsing or processing expensive operations.
- Independently re-check eligibility fields.
- Read KV before Workers AI and Vectorize in `live` mode.
- In `cacheOnly`, never call Workers AI or Vectorize.
- Write KV responses only after successful live Vectorize results.
- Use R2 only for emoji index artifacts and load metadata by `emojiIndexVersion`.
- Use D1 only for optional control-plane metadata or counters, never raw text.
- Return response schemas exactly as documented here.
- Log only sanitized, coarse operational fields.

Index build tasks:

- Build versioned emoji artifacts from public custom emoji names, aliases, and categories.
- Store immutable artifacts in R2 using `emojiIndexVersion` object prefixes.
- Upsert vectors into Vectorize with IDs that are emoji identifiers, not note/user identifiers.
- Keep the R2 artifact as the source of truth for rebuild/export.

## Failure Reasons

The v1 reason enum is:

- `disabled`
- `ineligible`
- `emptyText`
- `cacheMiss`
- `budgetExceeded`
- `budgetStateUnavailable`
- `timeout`
- `workerUnauthorized`
- `workerUnavailable`
- `embeddingUnavailable`
- `vectorizeUnavailable`
- `cacheUnavailable`

Unknown failures are mapped to `workerUnavailable` before returning to frontend.

## Contract Versioning

This document defines these v1 identifiers:

- Backend endpoint response shape: `emoji-suggest-backend-response-v1`
- Worker request shape: `emoji-suggest-worker-request-v1`
- Worker response shape: `emoji-suggest-worker-response-v1`
- Result shape: `emoji-suggest-result-v1`
- Normalization schema: `emoji-suggest-normalization-v1`

Any future change that alters eligibility, CW handling, persistence rules, cache-key fields, result fields, budget semantics, or embedding candidate set cost model requires a new contract version and migration notes.
