const ORIGIN_ONLY_ROUTE_PREFIXES = [
	'/api/',
	'/streaming',
	'/manifest.json',
	'/robots.txt',
	'/api-doc',
	'/api.json',
	'/oauth/',
	'/miauth/',
	'/auth/',
	'/url',
	'/emoji/',
	'/twemoji/',
	'/twemoji-badge/',
	'/flush',
	'/.well-known/',
	'/inbox',
	'/users/',
	'/objects/',
	'/embed.js',
	'/opensearch.xml',
];

const ASSET_ROUTE_PREFIXES = [
	'/vite/',
	'/embed_vite/',
	'/assets/',
	'/static-assets/',
	'/client-assets/',
	'/fluent-emojis/',
	'/fluent-emoji/',
	'/sw.js',
	'/favicon.ico',
	'/apple-touch-icon.png',
];

const ACTIVITYPUB_ROUTE_PREFIXES = [
	'/notes/',
];

const FEED_ROUTE_PATTERN = /^\/@[^/]+\.(atom|rss|json)$/;
const ACTIVITYPUB_USER_ROUTE_PATTERN = /^\/@[^/]+$/;

const SSR_ROUTE_PATTERNS = [
	{ type: 'embedUserTimeline', pattern: /^\/embed\/user-timeline\/([^/]+)$/ },
	{ type: 'embedNote', pattern: /^\/embed\/notes\/([^/]+)$/ },
	{ type: 'embedClip', pattern: /^\/embed\/clips\/([^/]+)$/ },
	{ type: 'userPage', pattern: /^\/@([^/]+)(?:\/([^/]+))?$/ },
	{ type: 'notePage', pattern: /^\/notes\/([^/]+)$/ },
	{ type: 'pagePage', pattern: /^\/@([^/]+)\/pages\/([^/]+)$/ },
	{ type: 'flashPage', pattern: /^\/play\/([^/]+)$/ },
	{ type: 'clipPage', pattern: /^\/clips\/([^/]+)$/ },
	{ type: 'galleryPostPage', pattern: /^\/gallery\/([^/]+)$/ },
	{ type: 'channelPage', pattern: /^\/channels\/([^/]+)$/ },
	{ type: 'reversiGamePage', pattern: /^\/reversi\/g\/([^/]+)$/ },
	{ type: 'announcementPage', pattern: /^\/announcements\/([^/]+)$/ },
	{ type: 'noindexPage', pattern: /^\/(?:tags|user-tags)\/([^/]+)$/ },
];

export function isOriginOnlyRoute(request) {
	const url = new URL(request.url);
	const pathname = url.pathname;

	if (request.method !== 'GET' && request.method !== 'HEAD') return true;
	if (ORIGIN_ONLY_ROUTE_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix))) return true;
	if (FEED_ROUTE_PATTERN.test(pathname)) return true;
	if (acceptsActivityPub(request.headers.get('Accept')) && ACTIVITYPUB_USER_ROUTE_PATTERN.test(pathname)) return true;

	return acceptsActivityPub(request.headers.get('Accept')) && ACTIVITYPUB_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isAssetPath(pathname) {
	return ASSET_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function matchSsrRoute(pathname) {
	for (const route of SSR_ROUTE_PATTERNS) {
		const match = pathname.match(route.pattern);
		if (match != null) return { type: route.type, params: match.slice(1).map(decodeURIComponent) };
	}

	if (pathname.startsWith('/embed/')) return { type: 'embedFallback', params: [] };

	return null;
}

function acceptsActivityPub(acceptHeader) {
	if (acceptHeader == null) return false;
	return acceptHeader.includes('application/activity+json') || acceptHeader.includes('application/ld+json');
}
