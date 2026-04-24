# Cloudflare single-origin route model

This Worker package is intended to run on **one public hostname** such as `prismisskey.space`.

## Target routing model

Configure Cloudflare so that:

- `prismisskey.space/*` → **frontend Worker**
- backend-only paths → **no Worker route** so they fall through to the Cloudflare Tunnel origin

This is cleaner than maintaining a large frontend allowlist because Misskey frontend routes change more often than backend protocol routes.

## Why this file exists

`wrangler.jsonc` can represent the broad Worker route, but the backend-only **negative overrides** are usually managed in the Cloudflare dashboard or via the Cloudflare API rather than in Wrangler config.

Do **not** deploy the broad `prismisskey.space/*` Worker route to production unless the backend overrides below already exist.

## Required backend no-worker overrides

At minimum, exclude these paths from the Worker so they continue to hit the Tunnel/backend directly:

```txt
/api/*
/streaming*
/oauth/*
/auth/*
/miauth/*
/.well-known/*
/nodeinfo*
/inbox*
/users/*
/objects/*
/manifest.json
/robots.txt
/api.json
/api-doc
/opensearch.xml
/embed.js
/url*
/flush
```

## Paths that should stay on the Worker

Once the overrides above exist, everything else can stay on the Worker, including:

- frontend SPA routes
- page-level SSR/OG routes such as `/@*`, `/notes/*`, `/play/*`, `/clips/*`, `/gallery/*`, `/channels/*`, `/reversi/g/*`, `/announcements/*`, `/embed/*`
- static assets under `/vite/*`, `/embed_vite/*`, `/assets/*`, `/client-assets/*`, `/static-assets/*`, `/fluent-emojis/*`, `/fluent-emoji/*`
- media proxy paths such as `/proxy/*`, `/image.webp*`, `/preview.webp*`, `/static.webp*`, `/svg.webp*`, `/emoji.webp*`, `/emoji.png*`

## Notes

- Custom emoji lookup paths like `/emoji/<name>.webp` still belong to the backend because they require DB lookup.
- ActivityPub requests are still distinguished by `Accept` header in Worker code for routes like `/notes/*` and `/@user`.
- With this model, new frontend routes automatically work without editing `wrangler.jsonc`.
