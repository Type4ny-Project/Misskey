const MEDIA_PROXY_FILENAMES = new Set([
	'/image.webp',
	'/preview.webp',
	'/static.webp',
	'/svg.webp',
	'/emoji.webp',
	'/emoji.png',
]);

export function isMediaProxyRoute(pathname) {
	return pathname.startsWith('/proxy/') || MEDIA_PROXY_FILENAMES.has(pathname);
}

export async function handleMediaProxy(request, env) {
	const requestUrl = new URL(request.url);
	const sourceUrl = getSourceUrl(requestUrl);
	if (sourceUrl == null || !isAllowedSourceUrl(sourceUrl, requestUrl)) {
		return fallbackOrStatus(request, env, 400);
	}

	const imageOptions = getImageOptions(requestUrl);
	const headers = new Headers(request.headers);
	headers.set('Accept', 'image/avif,image/webp,image/*,*/*;q=0.8');
	headers.set('User-Agent', 'Misskey-MediaProxy/Cloudflare-Workers');

	for (const headerName of ['Host', 'Cookie', 'Authorization', 'Referer', 'Origin']) {
		headers.delete(headerName);
	}

	const upstream = await fetchWithImageFallback(sourceUrl, headers, imageOptions);

	if (!upstream.ok) {
		return fallbackOrStatus(request, env, upstream.status === 404 ? 404 : 204);
	}

	const contentType = upstream.headers.get('Content-Type') ?? '';
	if (!contentType.startsWith('image/')) {
		return fallbackOrStatus(request, env, 404);
	}
	if (requestUrl.pathname.endsWith('.webp') && contentType.includes('svg')) {
		return fallbackOrStatus(request, env, 404);
	}

	const responseHeaders = new Headers();
	responseHeaders.set('Content-Type', contentType);
	responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
	responseHeaders.set('Content-Disposition', 'inline');
	responseHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

	const contentLength = upstream.headers.get('Content-Length');
	if (contentLength != null) responseHeaders.set('Content-Length', contentLength);

	return new Response(upstream.body, {
		status: 200,
		headers: responseHeaders,
	});
}

async function fetchWithImageFallback(sourceUrl, headers, imageOptions) {
	if (imageOptions == null) {
		return fetch(sourceUrl, { headers });
	}

	const transformed = await fetch(sourceUrl, {
		headers,
		cf: { image: imageOptions },
	});

	if (transformed.ok) return transformed;

	return fetch(sourceUrl, { headers });
}

function getSourceUrl(requestUrl) {
	const queryUrl = requestUrl.searchParams.get('url');
	if (queryUrl != null && queryUrl !== '') return queryUrl;

	if (!requestUrl.pathname.startsWith('/proxy/')) return null;

	const pathUrl = requestUrl.pathname.slice('/proxy/'.length);
	if (pathUrl === '') return null;

	return `https://${pathUrl}`;
}

function isAllowedSourceUrl(source, requestUrl) {
	let url;
	try {
		url = new URL(source);
	} catch {
		return false;
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
	if (url.username !== '' || url.password !== '') return false;
	if (url.hostname === requestUrl.hostname && isMediaProxyRoute(url.pathname)) return false;

	return true;
}

function getImageOptions(requestUrl) {
	const isPreview = requestUrl.pathname === '/preview.webp' || requestUrl.searchParams.has('preview');
	const isStatic = requestUrl.pathname === '/static.webp' || requestUrl.searchParams.has('static');
	const isEmoji = requestUrl.pathname === '/emoji.webp' || requestUrl.searchParams.has('emoji');
	const isAvatar = requestUrl.searchParams.has('avatar');
	const isBadge = requestUrl.pathname === '/emoji.png' || requestUrl.searchParams.has('badge');

	if (isBadge) return { width: 96, height: 96, fit: 'contain', format: 'png' };
	if (isPreview) return { width: 200, height: 200, fit: 'scale-down', format: 'webp' };
	if (isEmoji) return { height: 128, fit: 'scale-down', format: 'webp' };
	if (isAvatar) return { height: 320, fit: 'scale-down', format: 'webp' };
	if (isStatic) return { width: 498, height: 422, fit: 'scale-down', format: 'webp' };
	if (requestUrl.pathname.endsWith('.webp')) return { format: 'webp' };

	return null;
}

async function fallbackOrStatus(request, env, status) {
	const requestUrl = new URL(request.url);
	if (!requestUrl.searchParams.has('fallback')) {
		return new Response(null, { status });
	}

	return env.ASSETS.fetch(new Request(new URL('/client-assets/dummy.png', request.url)));
}
