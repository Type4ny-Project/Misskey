# Cloudflare Workers frontend deployment

This package deploys the Misskey frontend shell and static frontend assets to Cloudflare Workers.

The existing backend SSR path is tightly coupled to Fastify, database repositories, runtime filesystem reads, and Node WebSocket upgrade handling. The Worker therefore uses the existing Node backend as the data/origin layer while rendering frontend HTML and OG tags at the edge:

- Cloudflare Workers serves the frontend shell and built static assets.
- Backend-only paths stay on the same public hostname and fall through to the Cloudflare Tunnel origin by Worker route splitting.
- Media proxy image routes such as `/proxy/*`, `/image.webp`, `/preview.webp`, `/static.webp`, `/svg.webp`, `/emoji.webp`, and `/emoji.png` run on Workers.
- Public-facing URLs in the generated shell are based on the incoming request origin, so the Worker respects the actual hostname that reached Cloudflare.
- Page-specific Open Graph SSR is rendered in the Worker for browser HTML requests. The Worker fetches packed public objects from the Node backend API, then emits the equivalent page-level meta/client-context HTML at the edge.

This is intentionally not `/api`-only. The current frontend also depends on a few non-API backend routes such as `/streaming`, `/auth`, `/miauth`, `/oauth`, `/proxy`, `/emoji`, `/url`, `/twemoji`, and some backend-owned text/JSON endpoints.

## Build

From the repository root:

```sh
pnpm build:cloudflare-worker
```

This runs the normal Misskey build, then assembles the Workers asset directory at `built/cloudflare-worker/assets`.

## Local dev

Start the normal backend on `http://localhost:3000`, then run:

```sh
pnpm --filter frontend-worker dev
```

## Deploy

Deploy the Worker routes on the same hostname that is also assigned to the backend Tunnel origin:

```sh
pnpm deploy:cloudflare-worker
```

Replace the placeholder route patterns in `wrangler.jsonc` (`example.com/...`) with your actual zone hostname before deploying.

## One hostname with Cloudflare Tunnel

Workers do not have a Cloudflare Tunnel binding, and a Worker should not `fetch()` its own same-zone route as a backend proxy target. The supported one-hostname shape is route splitting:

- DNS/Tunnel sends the hostname to the Node backend by default.
- Worker routes are attached only to frontend/static/SSR paths.
- Backend-only paths have no Worker route, so they fall through to the Tunnel origin.

Example Tunnel config on the backend host:

```yaml
# cloudflared config on the backend host
tunnel: <UUID>
credentials-file: /path/to/<UUID>.json

ingress:
  - hostname: example.com
    service: http://localhost:3000
  - service: http_status:404
```

```sh
cloudflared tunnel route dns <UUID> example.com
```

Traffic then flows either:

- Browser HTML/static/SSR path → Worker → static assets / edge SSR
- Backend path with no Worker route → Tunnel → Node backend

Worker-internal SSR data fetches call the same origin's `/api/*` endpoints. Keep `/api/*` excluded from Worker routes so those calls resolve to the Tunnel origin instead of re-entering the Worker.

## Minimal backend allowlist

The current Worker keeps Worker execution deliberately narrow:

- page-level SSR/OG paths such as `/@*`, `/notes/*`, `/play/*`, `/clips/*`, `/gallery/*`, `/channels/*`, `/reversi/g/*`, `/announcements/*`, and `/embed/*`
- static asset paths such as `/vite/*`, `/embed_vite/*`, `/assets/*`, `/client-assets/*`, `/static-assets/*`, `/fluent-emojis/*`, `/fluent-emoji/*`, `/sw.js`, `/favicon.ico`, and `/apple-touch-icon.png`
- media proxy paths such as `/proxy/*`, `/image.webp`, `/preview.webp`, `/static.webp`, `/svg.webp`, `/emoji.webp`, and `/emoji.png`

Backend paths such as `/api/*`, `/streaming*`, custom emoji lookup paths like `/emoji/<name>.webp`, `/oauth/*`, ActivityPub, and backend JSON/text endpoints should be excluded from Worker routes so they fall through to the Tunnel origin.

Wrangler can declaratively decide which paths hit the Worker first. There is no production `origin`/`proxy_pass` setting in `wrangler.jsonc`.
