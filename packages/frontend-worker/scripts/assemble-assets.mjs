import { cp, mkdir, rm, stat, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(packageDir, '../../..');
const outputDir = resolve(rootDir, 'built/cloudflare-worker/assets');

async function pathExists(path) {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}

async function copyDirectory({ from, to, required = true }) {
	if (!await pathExists(from)) {
		if (required) {
			throw new Error(`Required Cloudflare Worker asset source is missing: ${from}`);
		}

		console.warn(`Skipping optional Cloudflare Worker asset source: ${from}`);
		return;
	}

	await cp(from, to, { recursive: true });
}

async function copyFileIfExists({ from, to, required = true }) {
	if (!await pathExists(from)) {
		if (required) {
			throw new Error(`Required Cloudflare Worker asset file is missing: ${from}`);
		}

		console.warn(`Skipping optional Cloudflare Worker asset file: ${from}`);
		return;
	}

	await mkdir(dirname(to), { recursive: true });
	await copyFile(from, to);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await copyDirectory({
	from: resolve(rootDir, 'built/_frontend_vite_'),
	to: resolve(outputDir, 'vite'),
});
await copyDirectory({
	from: resolve(rootDir, 'built/_frontend_embed_vite_'),
	to: resolve(outputDir, 'embed_vite'),
});
await copyDirectory({
	from: resolve(rootDir, 'built/_frontend_dist_'),
	to: resolve(outputDir, 'assets'),
});
await copyDirectory({
	from: resolve(rootDir, 'packages/backend/assets'),
	to: resolve(outputDir, 'static-assets'),
});
await copyDirectory({
	from: resolve(rootDir, 'packages/frontend/assets'),
	to: resolve(outputDir, 'client-assets'),
});
await copyDirectory({
	from: resolve(rootDir, 'fluent-emojis/dist'),
	to: resolve(outputDir, 'fluent-emojis'),
	required: false,
});
await copyDirectory({
	from: resolve(rootDir, 'fluent-emojis/dist'),
	to: resolve(outputDir, 'fluent-emoji'),
	required: false,
});
await copyFileIfExists({
	from: resolve(rootDir, 'built/_sw_dist_/sw.js'),
	to: resolve(outputDir, 'sw.js'),
});
await copyFileIfExists({
	from: resolve(rootDir, 'packages/backend/assets/favicon.ico'),
	to: resolve(outputDir, 'favicon.ico'),
});
await copyFileIfExists({
	from: resolve(rootDir, 'packages/backend/assets/apple-touch-icon.png'),
	to: resolve(outputDir, 'apple-touch-icon.png'),
});

console.log(`Cloudflare Worker assets assembled at ${outputDir}`);
