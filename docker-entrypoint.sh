#!/bin/bash
set -euo pipefail

cd /misskey/packages/backend

# Keep the production process tree lean: pnpm is useful to resolve development
# scripts, but it must not remain as a Node process after Misskey has started.
node ./scripts/compile_config.js
pnpm typeorm migration:run -d ormconfig.js
node ./scripts/compile_config.js

exec node ./built/entry.js
