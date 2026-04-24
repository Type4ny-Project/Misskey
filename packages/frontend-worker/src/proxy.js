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
