const DEFAULT_MAX_AGE = 60;

export async function fetchOrigin(request, env) {
	const requestUrl = new URL(request.url);
	const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, requestUrl.origin);
	const headers = sanitizeProxyHeaders(request.headers);

	headers.set('X-Forwarded-Host', requestUrl.host);
	headers.set('X-Forwarded-Proto', requestUrl.protocol.replace(':', ''));

	const init = {
		method: request.method,
		headers,
		body: request.body,
		redirect: 'manual',
	};

	if (request.method === 'GET' || request.method === 'HEAD') {
		const cache = caches.default;
		const cacheKey = new Request(upstreamUrl.toString(), { method: request.method, headers });

		const cached = await cache.match(cacheKey);
		if (cached) {
			return cached;
		}

		const response = await fetch(new Request(upstreamUrl, init));

		if (response.ok && !response.headers.get('Set-Cookie')) {
			const cacheControl = response.headers.get('Cache-Control');
			const shouldCache = cacheControl
				? !cacheControl.includes('no-store') && !cacheControl.includes('private')
				: true;

			if (shouldCache) {
				const path = requestUrl.pathname;
				const isUncacheableIcon = path === '/favicon.ico' || path === '/apple-touch-icon.png';
				if (!isUncacheableIcon) {
					const cloned = response.clone();
					const newHeaders = new Headers(cloned.headers);
					if (!cacheControl) {
						newHeaders.set('Cache-Control', `public, max-age=${DEFAULT_MAX_AGE}`);
					}
					const cacheResponse = new Response(cloned.body, {
						status: cloned.status,
						statusText: cloned.statusText,
						headers: newHeaders,
					});
					await cache.put(cacheKey, cacheResponse);
				}
			}
		}

		return response;
	}

	return fetch(new Request(upstreamUrl, init));
}

function sanitizeProxyHeaders(inputHeaders) {
	const headers = new Headers(inputHeaders);

	for (const headerName of [
		'Host',
		'Connection',
		'Keep-Alive',
		'Proxy-Authenticate',
		'Proxy-Authorization',
		'TE',
		'Trailer',
		'Transfer-Encoding',
		'Upgrade',
		'Forwarded',
		'Via',
		'X-Forwarded-For',
		'X-Forwarded-Host',
		'X-Forwarded-Proto',
		'X-Real-IP',
		'CF-Connecting-IP',
		'True-Client-IP',
	]) {
		headers.delete(headerName);
	}

	return headers;
}
