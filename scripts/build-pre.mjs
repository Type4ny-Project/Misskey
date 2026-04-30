/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = import.meta.dirname;

const packageJsonPath = __dirname + '/../package.json'

function build() {
	try {
		const json = fs.readFileSync(packageJsonPath, 'utf-8')
		const meta = JSON.parse(json);
		fs.mkdirSync(__dirname + '/../built', { recursive: true });

		const gitCommit = (() => {
			try {
				return execSync('git rev-parse --short HEAD', { cwd: __dirname + '/..', encoding: 'utf-8' }).trim();
			} catch {
				return null;
			}
		})();

		fs.writeFileSync(__dirname + '/../built/meta.json', JSON.stringify({
			version: meta.version,
			commit: gitCommit,
		}), 'utf-8');
	} catch (e) {
		console.error(e)
	}
}

build();

if (process.argv.includes("--watch")) {
	fs.watch(packageJsonPath, (event, filename) => {
		console.log(`update ${filename} ...`)
		build()
	})
}
