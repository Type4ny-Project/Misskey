import http from 'node:http';

const port = Number(process.env.PROXY_PORT ?? '6100');
const upstreamPort = Number(process.env.PROXY_UPSTREAM_PORT ?? '3000');
const hostHeader = process.env.PROXY_HOST_HEADER;

if (!hostHeader) {
	throw new Error('PROXY_HOST_HEADER is required');
}

const server = http.createServer((req, res) => {
	const upstream = http.request({
		hostname: '127.0.0.1',
		port: upstreamPort,
		method: req.method,
		path: req.url,
		headers: {
			...req.headers,
			host: hostHeader,
			'x-forwarded-host': hostHeader,
			'x-forwarded-proto': 'https',
		},
	}, (upstreamRes) => {
		res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
		upstreamRes.pipe(res);
	});

	upstream.on('error', (error) => {
		res.statusCode = 502;
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		res.end(`proxy error: ${error.message}`);
	});

	req.pipe(upstream);
});

server.listen(port, '127.0.0.1', () => {
	console.log(`tenant proxy listening on :${port} -> host ${hostHeader}`);
});
