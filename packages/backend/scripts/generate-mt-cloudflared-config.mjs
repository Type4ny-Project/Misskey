import fs from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const root = resolve(import.meta.dirname, '../../..');
const configPath = resolve(root, '.config/mt-cloudflared.generated.yml');

const urlA = process.env.TENANT_A_URL;
const urlB = process.env.TENANT_B_URL;

if (!urlA || !urlB) {
	throw new Error('TENANT_A_URL and TENANT_B_URL are required');
}

const hostA = new URL(urlA).host;
const hostB = new URL(urlB).host;

const doc = {
	port: 3000,
	dbReplications: false,
	hosts: {
		[hostA]: {
			url: `${urlA}/`,
			db: {
				host: 'localhost',
				port: 5432,
				db: 'tenant_a',
				user: 'example-misskey-user',
				pass: 'example-misskey-pass',
			},
			redis: {
				host: 'localhost',
				port: 6379,
			},
		},
		[hostB]: {
			url: `${urlB}/`,
			db: {
				host: 'localhost',
				port: 5432,
				db: 'tenant_b',
				user: 'example-misskey-user',
				pass: 'example-misskey-pass',
			},
			redis: {
				host: 'localhost',
				port: 6379,
			},
		},
	},
	fulltextSearch: {
		provider: 'sqlLike',
	},
	id: 'aidx',
	proxyBypassHosts: [
		'api.deepl.com',
		'api-free.deepl.com',
		'www.recaptcha.net',
		'hcaptcha.com',
		'challenges.cloudflare.com',
	],
	cloudflareRealtime: {
		appId: '136bbf3d4e61bca3dd094a4641e9103d',
		appSecret: '3f38be4e2a00f470894c3198e6bed52e3f59de058dde89972b9ed9861c78e218',
		turn: {
			keyId: '0193be7f0cb9cd54ef78e7f5f1523648',
			apiToken: 'aa9cd5ff8e268dd7779a8324afd27a8dc8c8623e8c8e0368bd23e2c451358090',
			ttl: 86400,
		},
	},
	setupPassword: 'mt-fed-setup',
	rootUserName: 'root',
	rootPassword: 'rootpass',
	adminUserName: 'admin',
	adminPassword: 'adminpass',
};

fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }), 'utf-8');
console.log(`generated ${configPath} for ${hostA} and ${hostB}`);
