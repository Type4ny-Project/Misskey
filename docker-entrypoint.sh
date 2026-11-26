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
exec node "$root_dir/scripts/start.mjs" --migrate
