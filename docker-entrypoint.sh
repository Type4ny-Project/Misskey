#!/bin/bash
set -euo pipefail

script_path="${BASH_SOURCE[0]}"
if [[ "$script_path" != /* ]]; then
	script_path="$PWD/$script_path"
fi

while [[ -L "$script_path" ]]; do
	script_dir="$(cd -P -- "$(dirname -- "$script_path")" && pwd)"
	link_target="$(readlink "$script_path")"
	if [[ "$link_target" == /* ]]; then
		script_path="$link_target"
	else
		script_path="$script_dir/$link_target"
	fi
done

root_dir="$(cd -P -- "$(dirname -- "$script_path")" && pwd)"
cd -- "$root_dir/packages/backend"

# Keep the production process tree lean: pnpm is useful to resolve development
# scripts, but it must not remain as a Node process after Misskey has started.
node ./scripts/compile_config.js
pnpm typeorm migration:run -d ormconfig.js
node ./scripts/compile_config.js

exec node ./built/entry.js
