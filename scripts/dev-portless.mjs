/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { promises as fsp } from 'node:fs';
import { execa } from 'execa';
import * as yaml from 'js-yaml';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const rootDir = resolve(_dirname, '..');
const configDir = resolve(rootDir, '.config');
const defaultConfigPath = resolve(configDir, 'default.yml');
const generatedConfigPath = resolve(configDir, 'portless.generated.yml');

const requiredEnv = ['PORT', 'PORTLESS_URL'].filter(name => !process.env[name]);

if (requiredEnv.length > 0) {
	throw new Error(`dev:portless requires ${requiredEnv.join(' and ')} from the Portless environment.`);
}

const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
	throw new Error(`dev:portless requires PORT to be a valid TCP port, got ${process.env.PORT}.`);
}

const normalizedPortlessUrl = new URL(process.env.PORTLESS_URL);

if (!normalizedPortlessUrl.pathname.endsWith('/')) {
	normalizedPortlessUrl.pathname += '/';
}

const getFreePort = async () => {
	const server = createServer();

	return await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Failed to allocate a free port.'));
				return;
			}
			const freePort = address.port;
			server.close(closeError => {
				if (closeError) {
					reject(closeError);
					return;
				}
				resolve(freePort);
			});
		});
	});
};

await fsp.mkdir(configDir, { recursive: true });

const defaultConfig = yaml.load(await fsp.readFile(defaultConfigPath, 'utf-8')) ?? {};
const generatedConfig = {
	...defaultConfig,
	url: normalizedPortlessUrl.toString(),
	port,
};

await fsp.writeFile(generatedConfigPath, yaml.dump(generatedConfig), 'utf-8');

const [vitePort, embedVitePort] = await Promise.all([
	process.env.VITE_PORT ? Number(process.env.VITE_PORT) : getFreePort(),
	process.env.EMBED_VITE_PORT ? Number(process.env.EMBED_VITE_PORT) : getFreePort(),
]);

const env = {
	...process.env,
	MISSKEY_CONFIG_YML: 'portless.generated.yml',
	VITE_PORT: String(vitePort),
	EMBED_VITE_PORT: String(embedVitePort),
	VITE_URL_ORIGIN: process.env.VITE_URL_ORIGIN ?? 'http://127.0.0.1',
	EMBED_VITE_URL_ORIGIN: process.env.EMBED_VITE_URL_ORIGIN ?? 'http://127.0.0.1',
};

await execa('node', ['scripts/dev.mjs'], {
	cwd: rootDir,
	env,
	stdio: 'inherit',
});
