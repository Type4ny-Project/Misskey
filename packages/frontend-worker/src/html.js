export function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function escapeAttribute(value) {
	return escapeHtml(value);
}

export function safeJson(value) {
	return JSON.stringify(value)
		.replaceAll('<', '\\u003c')
		.replaceAll('>', '\\u003e')
		.replaceAll('&', '\\u0026')
		.replaceAll('\u2028', '\\u2028')
		.replaceAll('\u2029', '\\u2029');
}

export function metaTag(name, value, property = 'property') {
	if (value == null || value === '') return '';
	return `<meta ${property}="${escapeAttribute(name)}" content="${escapeAttribute(value)}">`;
}

export function linkTag(attrs) {
	return `<link ${Object.entries(attrs)
		.filter(([, value]) => value != null && value !== '')
		.map(([name, value]) => `${escapeAttribute(name)}="${escapeAttribute(value)}"`)
		.join(' ')}>`;
}
