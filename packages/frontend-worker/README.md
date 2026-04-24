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

Deploy the Worker on the same hostname that is also assigned to the backend Tunnel origin:

```sh
pnpm deploy:cloudflare-worker
```

Before deploying the broad `prismisskey.space/*` route, configure the backend no-worker overrides described in `./CLOUDFLARE_SINGLE_ORIGIN_ROUTES.md`.

## One hostname with Cloudflare Tunnel

Workers do not have a Cloudflare Tunnel binding, and a Worker should not `fetch()` its own same-zone route as a backend proxy target. The clean single-origin shape is:

- a broad Worker route on `prismisskey.space/*`
- backend-only no-worker override routes for API/protocol paths
- the hostname itself still points at the backend via Cloudflare Tunnel

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

- frontend/static/SSR path → Worker → static assets / edge SSR
- backend-only path with no Worker route → Tunnel → Node backend

Worker-internal SSR data fetches call the same origin's `/api/*` endpoints. Keep `/api/*` excluded from Worker routes so those calls resolve to the Tunnel origin instead of re-entering the Worker.

## Single-origin routing summary

The repo now assumes a broad Worker route model. The practical split is:

- Worker by default for frontend SPA, SSR/OG, static assets, and Worker media proxy routes
- no Worker override for backend-only protocol/API/auth paths

See `./CLOUDFLARE_SINGLE_ORIGIN_ROUTES.md` for the exact backend override list.

Wrangler can declaratively attach the broad Worker route. The backend negative overrides are a Cloudflare route-management concern. There is no production `origin`/`proxy_pass` setting in `wrangler.jsonc`.
