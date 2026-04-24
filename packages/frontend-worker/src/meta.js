export async function fetchInstanceMeta(request) {
	const requestUrl = new URL(request.url);
	const response = await fetch(new URL('/api/meta', requestUrl.origin), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'X-Forwarded-Host': requestUrl.host,
			'X-Forwarded-Proto': requestUrl.protocol.replace(':', ''),
		},
		body: JSON.stringify({ detail: true }),
	});

	if (!response.ok) return null;
	return response.json();
}
