export const LANGS = [
	'ar-SA',
	'ca-ES',
	'cs-CZ',
	'da-DK',
	'de-DE',
	'en-US',
	'es-ES',
	'fr-FR',
	'id-ID',
	'it-IT',
	'ja-JP',
	'ja-KS',
	'kab-KAB',
	'kn-IN',
	'ko-KR',
	'nl-NL',
	'no-NO',
	'pl-PL',
	'pt-PT',
	'ru-RU',
	'sk-SK',
	'th-TH',
	'tr-TR',
	'ug-CN',
	'uk-UA',
	'vi-VN',
	'zh-CN',
	'zh-TW',
];

export async function getViteFiles(env, manifestPath) {
	const response = await env.ASSETS.fetch(new Request(`https://assets.local${manifestPath}`));
	if (!response.ok) return { entryJs: null, css: [], modulePreloads: [] };

	const manifest = await response.json();
	const entryFile = Object.values(manifest).find((chunk) => chunk && chunk.isEntry);
	if (!entryFile) return { entryJs: null, css: [], modulePreloads: [] };

	const cssFiles = new Set(entryFile.css || []);
	const modulePreloads = new Set();
	const seenChunkIds = new Set();

	collectImportedAssets(manifest, entryFile.imports || [], cssFiles, modulePreloads, seenChunkIds);

	return {
		entryJs: entryFile.file || null,
		css: [...cssFiles],
		modulePreloads: [...modulePreloads],
	};
}

function collectImportedAssets(manifest, imports, cssFiles, modulePreloads, seenChunkIds, recursive = false) {
	for (const importId of imports) {
		if (seenChunkIds.has(importId)) continue;
		seenChunkIds.add(importId);

		const importedChunk = manifest[importId];
		if (!importedChunk) continue;

		for (const css of importedChunk.css || []) cssFiles.add(css);
		collectImportedAssets(manifest, importedChunk.imports || [], cssFiles, modulePreloads, seenChunkIds, true);

		if (!recursive && importedChunk.file) modulePreloads.add(importedChunk.file);
	}
}
