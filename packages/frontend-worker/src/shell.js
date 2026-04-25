import { getViteFiles, getBuildVersion, LANGS } from './assets.js';
import { escapeAttribute, escapeHtml, safeJson } from './html.js';
import { fetchInstanceMeta } from './meta.js';

const DEFAULT_THEME_COLOR = '#86b300';

export async function renderFrontendShell(request, env, overrides = {}) {
	const url = new URL(request.url);
	const [viteFiles, buildVersion, meta] = await Promise.all([
		getViteFiles(env, '/vite/manifest.json'),
		getBuildVersion(env),
		fetchInstanceMeta(request).catch(() => null),
	]);
	const common = createCommonProps(url, env, meta);

	return renderShell({
		...common,
		...overrides,
		appClass: '',
		assetPrefix: '/vite/',
		bootScriptPath: '/vite/loader/boot.js',
		bootStylePath: '/vite/loader/style.css',
		clientEntry: viteFiles.entryJs,
		cssFiles: viteFiles.css,
		modulePreloads: viteFiles.modulePreloads,
		includeManifest: true,
		version: getVersionWithCommit(buildVersion.version ?? common.version, buildVersion.commit),
		commit: buildVersion.commit,
		body: overrides.body ?? `<div id="misskey_app"></div>${renderSplash(overrides.icon ?? common.icon)}`,
	});
}

export async function renderEmbedShell(request, env, overrides = {}) {
	const url = new URL(request.url);
	const [viteFiles, buildVersion, meta] = await Promise.all([
		getViteFiles(env, '/embed_vite/manifest.json'),
		getBuildVersion(env),
		fetchInstanceMeta(request).catch(() => null),
	]);
	const common = createCommonProps(url, env, meta);

	return renderShell({
		...common,
		...overrides,
		appClass: 'embed',
		assetPrefix: '/embed_vite/',
		bootScriptPath: '/embed_vite/loader/boot.js',
		bootStylePath: '/embed_vite/loader/style.css',
		clientEntry: viteFiles.entryJs,
		cssFiles: viteFiles.css,
		modulePreloads: viteFiles.modulePreloads,
		includeManifest: false,
		robots: 'noindex',
		version: getVersionWithCommit(buildVersion.version ?? common.version, buildVersion.commit),
		commit: buildVersion.commit,
		body: overrides.body ?? `<div id="misskey_app"></div>${renderSplash(overrides.icon ?? common.icon)}`,
	});
}

export function htmlResponse(body, { cacheControl = 'no-store', headers = {} } = {}) {
	return new Response(body, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': cacheControl,
			...headers,
		},
	});
}

function createCommonProps(url, env, meta) {
	const instanceName = meta?.name || env.INSTANCE_NAME || url.host;
	return {
		appleTouchIcon: meta?.app512IconUrl || env.APPLE_TOUCH_ICON_URL || '/apple-touch-icon.png',
		description: meta?.description || env.INSTANCE_DESCRIPTION || 'Misskey is an open source, federated social media platform.',
		icon: meta?.iconUrl || env.ICON_URL || '/favicon.ico',
		instanceName,
		instanceUrl: url.origin,
		metaJson: meta != null ? safeJson(meta) : null,
		themeColor: meta?.themeColor || env.THEME_COLOR || DEFAULT_THEME_COLOR,
		title: instanceName || 'Misskey',
		version: env.VERSION || '2026.4.0-beta.0-tp.0',
	};
}

function getVersionWithCommit(version, commit) {
	return commit ? `${version}+${commit}` : version;
}

function renderShell(props) {
	const title = props.title || 'Misskey';
	const description = props.description ?? '';
	const metaTags = [
		`<meta charset="UTF-8">`,
		`<meta name="application-name" content="Misskey">`,
		`<meta name="referer" content="origin">`,
		`<meta name="theme-color" content="${escapeAttribute(props.themeColor)}">`,
		`<meta name="theme-color-orig" content="${escapeAttribute(props.themeColor)}">`,
		`<meta property="og:site_name" content="${escapeAttribute(props.instanceName)}">`,
		`<meta property="instance_url" content="${escapeAttribute(props.instanceUrl)}">`,
		`<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`,
		`<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">`,
		props.robots ? `<meta name="robots" content="${escapeAttribute(props.robots)}">` : '',
		props.description ? `<meta name="description" content="${escapeAttribute(description)}">` : '',
		props.extraMeta ?? '',
		props.ogHtml ?? defaultOgHtml({ title, description, image: props.image }),
	].filter(Boolean).join('\n');
	const cssLinks = props.cssFiles.map((href) => `<link rel="stylesheet" href="${props.assetPrefix}${escapeAttribute(href)}">`).join('\n');
	const modulePreloads = props.modulePreloads.map((href) => `<link rel="modulepreload" crossorigin href="${props.assetPrefix}${escapeAttribute(href)}">`).join('\n');
	const manifestLink = props.includeManifest ? '<link rel="manifest" href="/manifest.json">' : '';
	const metaJsonScript = props.metaJson != null ? `<script type="application/json" id="misskey_meta" data-generated-at="${Date.now()}">${props.metaJson}</script>` : '';
	const clientCtxScript = props.clientCtxJson != null ? `<script type="application/json" id="misskey_clientCtx" data-generated-at="${Date.now()}">${props.clientCtxJson}</script>` : '';
	const embedCtxScript = props.embedCtxJson != null ? `<script type="application/json" id="misskey_embedCtx" data-generated-at="${Date.now()}">${props.embedCtxJson}</script>` : '';

	return `<!DOCTYPE html>
<html${props.appClass ? ` class="${escapeAttribute(props.appClass)}"` : ''}>
<head>
${metaTags}
<link rel="icon" href="${escapeAttribute(props.icon)}">
<link rel="apple-touch-icon" href="${escapeAttribute(props.appleTouchIcon)}">
${manifestLink}
${modulePreloads}
${cssLinks}
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${props.bootStylePath}">
<script>const VERSION=${safeJson(props.version)};const COMMIT=${safeJson(props.commit ?? null)};const CLIENT_ENTRY=${safeJson(props.clientEntry)};const LANGS=${safeJson(LANGS)};</script>
${metaJsonScript}
${clientCtxScript}
${embedCtxScript}
<script src="${props.bootScriptPath}"></script>
</head>
<body>
<noscript><p>JavaScriptを有効にしてください<br>Please turn on your JavaScript</p></noscript>
${props.body}
</body>
</html>`;
}

export function defaultOgHtml({ title, description, image }) {
	return [
		`<meta property="og:title" content="${escapeAttribute(title || 'Misskey')}">`,
		`<meta property="og:description" content="${escapeAttribute(description || 'Misskey is an open source, federated social media platform.')}">`,
		image ? `<meta property="og:image" content="${escapeAttribute(image)}">` : '',
		`<meta property="twitter:card" content="summary">`,
	].filter(Boolean).join('\n');
}

export function renderSplash(icon) {
	return `<div id="splash"><img id="splashIcon" src="${escapeAttribute(icon)}" alt="" style="width: 64px; height: 64px; border-radius: 16px;"><div id="splashSpinner"></div></div>`;
}
