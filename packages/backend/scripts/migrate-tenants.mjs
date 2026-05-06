import { execa } from 'execa';
import fs from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const builtConfigPath = resolve(root, 'built/.config.json');

if (!fs.existsSync(builtConfigPath)) {
	throw new Error('compiled config not found');
}

const config = JSON.parse(fs.readFileSync(builtConfigPath, 'utf-8'));

const hosts = config.hosts && Object.keys(config.hosts).length > 0
	? config.hosts
	: null;

const tenants = hosts
	? Object.entries(hosts).map(([host, tenant]) => ({ host, db: tenant.db }))
	: [
		{ host: config.url ? new URL(config.url).host : 'default', db: config.db },
		...Object.entries(config.tenants?.hosts ?? {}).map(([host, tenant]) => ({ host, db: tenant.db })),
	];

for (const { host, db } of tenants) {
	console.log(`running migrations for ${host} -> ${db.host}:${db.port}/${db.db}`);
	await execa('pnpm', ['typeorm', 'migration:run', '-d', 'ormconfig.js'], {
		cwd: resolve(root, 'packages/backend'),
		stdio: 'inherit',
		env: {
			DATABASE_HOST: db.host,
			DATABASE_PORT: String(db.port),
			DATABASE_DB: db.db,
			DATABASE_USER: db.user,
			DATABASE_PASSWORD: db.pass,
		},
	});
	console.log(`migrations finished for ${host}`);
}
