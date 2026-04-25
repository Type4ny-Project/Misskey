import { isAssetPath, isOriginOnlyRoute, matchSsrRoute } from './routes.js';
import { handleMediaProxy, isMediaProxyRoute } from './media-proxy.js';
import { fetchOrigin } from './proxy.js';
import { htmlResponse, renderEmbedShell, renderFrontendShell } from './shell.js';
import { renderSsrRoute } from './ssr.js';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === 'GET' && isMediaProxyRoute(url.pathname)) {
			return handleMediaProxy(request, env);
		}

		if (isOriginOnlyRoute(request)) {
			return fetchOrigin(request, env);
		}

		if (isAssetPath(url.pathname)) {
			const assetResponse = await env.ASSETS.fetch(request);
			if (assetResponse.status !== 404) return assetResponse;

			if (url.pathname === '/favicon.ico' || url.pathname === '/apple-touch-icon.png') {
				return fetchOrigin(request, env);
			}

			return assetResponse;
		}

		const ssrRoute = matchSsrRoute(url.pathname);
		if (ssrRoute != null) {
			const ssrResponse = await renderSsrRoute(request, env, ssrRoute);
			if (ssrResponse != null) return ssrResponse;
		}

		const shell = url.pathname.startsWith('/embed/')
			? await renderEmbedShell(request, env)
			: await renderFrontendShell(request, env);

		return htmlResponse(shell, { cacheControl: 'no-store' });
	},
};
