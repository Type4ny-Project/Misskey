import { escapeAttribute, metaTag, safeJson } from './html.js';
import { defaultOgHtml, htmlResponse, renderEmbedShell, renderFrontendShell } from './shell.js';

export async function renderSsrRoute(request, env, route) {
	try {
		switch (route.type) {
			case 'userPage':
				return renderUserPage(request, env, route.params);
			case 'notePage':
				return renderNotePage(request, env, route.params);
			case 'pagePage':
				return renderPagePage(request, env, route.params);
			case 'flashPage':
				return renderEntityPage(request, env, route.params[0], buildFlashPage, 'flash/show', 'flashId', 'public, max-age=15');
			case 'clipPage':
				return renderEntityPage(request, env, route.params[0], buildClipPage, 'clips/show', 'clipId', 'public, max-age=15');
			case 'galleryPostPage':
				return renderEntityPage(request, env, route.params[0], buildGalleryPostPage, 'gallery/posts/show', 'postId', 'public, max-age=15');
			case 'channelPage':
				return renderEntityPage(request, env, route.params[0], buildChannelPage, 'channels/show', 'channelId', 'public, max-age=15');
			case 'reversiGamePage':
				return renderEntityPage(request, env, route.params[0], buildReversiGamePage, 'reversi/show-game', 'gameId', 'public, max-age=3600');
			case 'announcementPage':
				return renderEntityPage(request, env, route.params[0], buildAnnouncementPage, 'announcements/show', 'announcementId', 'public, max-age=3600');
			case 'embedUserTimeline':
				return renderEmbedEntity(request, env, route.params[0], 'users/show', 'userId', 'user');
			case 'embedNote':
				return renderEmbedEntity(request, env, route.params[0], 'notes/show', 'noteId', 'note');
			case 'embedClip':
				return renderEmbedEntity(request, env, route.params[0], 'clips/show', 'clipId', 'clip');
			case 'embedFallback':
				return htmlResponse(await renderEmbedShell(request, env), { cacheControl: 'public, max-age=3600' });
			case 'noindexPage':
				return htmlResponse(await renderFrontendShell(request, env, { robots: 'noindex' }), { cacheControl: 'public, max-age=30' });
			default:
				return null;
		}
	} catch (error) {
		console.warn(`Worker SSR fallback for ${route.type}:`, error);
		return null;
	}
}

async function renderUserPage(request, env, [acct, sub]) {
	const user = await api(request, env, 'users/show', acctToUsersShowBody(acct));
	if (!user) return null;

	const title = user.name ? `${user.name} (@${user.username}${user.host ? `@${user.host}` : ''})` : `@${user.username}${user.host ? `@${user.host}` : ''}`;
	const pageTitle = `${user.name || user.username} (@${user.username}) | ${getInstanceName(request, env)}`;
	const url = new URL(request.url);
	const extraMeta = [
		user.host != null ? metaTag('robots', 'noindex', 'name') : '',
		metaTag('misskey:user-username', user.username, 'name'),
		metaTag('misskey:user-id', user.id, 'name'),
		sub == null && user.host == null ? `<link rel="alternate" type="application/activity+json" href="${escapeAttribute(`${url.origin}/users/${user.id}`)}">` : '',
		user.uri ? `<link rel="alternate" type="application/activity+json" href="${escapeAttribute(user.uri)}">` : '',
	].filter(Boolean).join('\n');
	const ogHtml = [
		metaTag('og:type', 'blog'),
		metaTag('og:title', title),
		metaTag('og:description', user.description),
		metaTag('og:url', `${url.origin}/@${user.username}`),
		metaTag('og:image', user.avatarUrl),
		metaTag('twitter:card', 'summary'),
	].join('\n');

	return htmlResponse(await renderFrontendShell(request, env, {
		title: pageTitle,
		description: user.description ?? '',
		extraMeta,
		ogHtml,
		clientCtxJson: safeJson({ user }),
	}), { cacheControl: 'public, max-age=15', headers: { Vary: 'Accept' } });
}

async function renderNotePage(request, env, [noteId]) {
	const note = await api(request, env, 'notes/show', { noteId });
	if (!note || !['public', 'home'].includes(note.visibility)) return null;

	const title = note.user.name ? `${note.user.name} (@${note.user.username}${note.user.host ? `@${note.user.host}` : ''})` : `@${note.user.username}${note.user.host ? `@${note.user.host}` : ''}`;
	const summary = getNoteSummary(note);
	const images = (note.files ?? []).filter((file) => file.type?.startsWith('image/'));
	const videos = (note.files ?? []).filter((file) => file.type?.startsWith('video/'));
	const url = new URL(request.url);
	const extraMeta = [
		note.user.host != null || isRenote(note) ? metaTag('robots', 'noindex', 'name') : '',
		metaTag('misskey:user-username', note.user.username, 'name'),
		metaTag('misskey:user-id', note.user.id, 'name'),
		metaTag('misskey:note-id', note.id, 'name'),
		note.user.host == null ? `<link rel="alternate" type="application/activity+json" href="${escapeAttribute(`${url.origin}/notes/${note.id}`)}">` : '',
		note.uri ? `<link rel="alternate" type="application/activity+json" href="${escapeAttribute(note.uri)}">` : '',
	].filter(Boolean).join('\n');
	const mediaOg = [
		...videos.flatMap((video) => [
			metaTag('og:video:url', video.url),
			metaTag('og:video:secure_url', video.url),
			metaTag('og:video:type', video.type),
			metaTag('og:video:image', video.thumbnailUrl),
			video.properties?.width != null ? metaTag('og:video:width', String(video.properties.width)) : '',
			video.properties?.height != null ? metaTag('og:video:height', String(video.properties.height)) : '',
		]),
		...(images.length > 0 ? [
			metaTag('twitter:card', 'summary_large_image'),
			...images.flatMap((image) => [
				metaTag('og:image', image.url),
				image.properties?.width != null ? metaTag('og:image:width', String(image.properties.width)) : '',
				image.properties?.height != null ? metaTag('og:image:height', String(image.properties.height)) : '',
			]),
		] : [
			metaTag('twitter:card', 'summary'),
			metaTag('og:image', note.user.avatarUrl),
		]),
	].filter(Boolean).join('\n');
	const ogHtml = [
		metaTag('og:type', 'article'),
		metaTag('og:title', title),
		metaTag('og:description', summary),
		metaTag('og:url', `${url.origin}/notes/${note.id}`),
		mediaOg,
	].join('\n');

	return htmlResponse(await renderFrontendShell(request, env, {
		title: `${title} | ${getInstanceName(request, env)}`,
		description: summary,
		extraMeta,
		ogHtml,
		clientCtxJson: safeJson({ note }),
	}), { cacheControl: 'public, max-age=15', headers: { Vary: 'Accept' } });
}

async function renderPagePage(request, env, [acct, pageName]) {
	const { username } = parseAcct(acct);
	const page = await api(request, env, 'pages/show', { username, name: pageName });
	if (!page) return null;

	return htmlResponse(await renderFrontendShell(request, env, buildPagePage(request, env, page)), { cacheControl: 'public, max-age=15' });
}

async function renderEntityPage(request, env, id, builder, endpoint, key, cacheControl) {
	const entity = await api(request, env, endpoint, { [key]: id });
	if (!entity) return null;
	return htmlResponse(await renderFrontendShell(request, env, builder(request, env, entity)), { cacheControl });
}

async function renderEmbedEntity(request, env, id, endpoint, key, ctxKey) {
	const entity = await api(request, env, endpoint, { [key]: id });
	if (!entity) return null;
	return htmlResponse(await renderEmbedShell(request, env, { embedCtxJson: safeJson({ [ctxKey]: entity }) }), { cacheControl: 'public, max-age=3600' });
}

function buildPagePage(request, env, page) {
	const url = new URL(request.url);
	const image = page.eyeCatchingImage ? (page.eyeCatchingImage.thumbnailUrl ?? page.eyeCatchingImage.url) : page.user?.avatarUrl;
	return {
		title: `${page.title} | ${getInstanceName(request, env)}`,
		description: page.summary ?? '',
		extraMeta: [
			metaTag('misskey:user-username', page.user?.username, 'name'),
			metaTag('misskey:user-id', page.user?.id, 'name'),
			metaTag('misskey:page-id', page.id, 'name'),
		].join('\n'),
		ogHtml: [
			metaTag('og:type', 'article'),
			metaTag('og:title', page.title),
			metaTag('og:description', page.summary),
			metaTag('og:url', `${url.origin}/pages/${page.id}`),
			metaTag('og:image', image),
			metaTag('twitter:card', page.eyeCatchingImage ? 'summary_large_image' : 'summary'),
		].join('\n'),
	};
}

function buildFlashPage(request, env, flash) {
	return entityWithUserOg(request, env, {
		entity: flash,
		path: `/play/${flash.id}`,
		metaName: 'misskey:flash-id',
		title: flash.title,
		description: flash.summary,
		image: flash.user?.avatarUrl,
	});
}

function buildClipPage(request, env, clip) {
	return entityWithUserOg(request, env, {
		entity: clip,
		path: `/clips/${clip.id}`,
		metaName: 'misskey:clip-id',
		title: clip.name,
		description: clip.description ?? '',
		image: clip.user?.avatarUrl,
	});
}

function buildGalleryPostPage(request, env, galleryPost) {
	const file = galleryPost.files?.[0];
	return entityWithUserOg(request, env, {
		entity: galleryPost,
		path: `/gallery/${galleryPost.id}`,
		metaName: 'misskey:gallery-post-id',
		title: galleryPost.title,
		description: galleryPost.description ?? '',
		image: galleryPost.isSensitive ? galleryPost.user?.avatarUrl : (file?.thumbnailUrl ?? file?.url),
		largeImage: !galleryPost.isSensitive && file != null,
	});
}

function buildChannelPage(request, env, channel) {
	const url = new URL(request.url);
	return {
		title: `${channel.name} | ${getInstanceName(request, env)}`,
		description: channel.description ?? '',
		ogHtml: [
			metaTag('og:type', 'website'),
			metaTag('og:title', channel.name),
			metaTag('og:description', channel.description),
			metaTag('og:url', `${url.origin}/channels/${channel.id}`),
			metaTag('og:image', channel.bannerUrl),
			metaTag('twitter:card', 'summary'),
		].join('\n'),
	};
}

function buildReversiGamePage(request, env, game) {
	const title = `${game.user1?.username ?? '?'} vs ${game.user2?.username ?? '?'}`;
	const description = '⚫⚪Misskey Reversi⚪⚫';
	const url = new URL(request.url);
	return {
		title: `${title} | ${getInstanceName(request, env)}`,
		description,
		ogHtml: [
			metaTag('og:type', 'article'),
			metaTag('og:title', title),
			metaTag('og:description', description),
			metaTag('og:url', `${url.origin}/reversi/g/${game.id}`),
			metaTag('twitter:card', 'summary'),
		].join('\n'),
	};
}

function buildAnnouncementPage(request, env, announcement) {
	const description = announcement.text?.length > 100 ? `${announcement.text.slice(0, 100)}…` : (announcement.text ?? '');
	const url = new URL(request.url);
	return {
		title: `${announcement.title} | ${getInstanceName(request, env)}`,
		description,
		ogHtml: [
			metaTag('og:type', 'article'),
			metaTag('og:title', announcement.title),
			metaTag('og:description', description),
			metaTag('og:url', `${url.origin}/announcements/${announcement.id}`),
			metaTag('og:image', announcement.imageUrl),
			metaTag('twitter:card', announcement.imageUrl ? 'summary_large_image' : 'summary'),
		].join('\n'),
	};
}

function entityWithUserOg(request, env, { entity, path, metaName, title, description, image, largeImage = false }) {
	const url = new URL(request.url);
	return {
		title: `${title} | ${getInstanceName(request, env)}`,
		description,
		extraMeta: [
			metaTag('misskey:user-username', entity.user?.username, 'name'),
			metaTag('misskey:user-id', entity.user?.id, 'name'),
			metaTag(metaName, entity.id, 'name'),
		].join('\n'),
		ogHtml: [
			metaTag('og:type', 'article'),
			metaTag('og:title', title),
			metaTag('og:description', description),
			metaTag('og:url', `${url.origin}${path}`),
			metaTag('og:image', image),
			metaTag('twitter:card', largeImage ? 'summary_large_image' : 'summary'),
		].join('\n'),
	};
}

async function api(request, env, endpoint, body) {
	const requestUrl = new URL(request.url);
	const apiUrl = new URL(`/api/${endpoint}`, requestUrl.origin);
	const init = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'X-Forwarded-Host': requestUrl.host,
			'X-Forwarded-Proto': requestUrl.protocol.replace(':', ''),
		},
		body: JSON.stringify(body),
	};

	const response = await fetch(apiUrl, init);

	if (!response.ok) return null;
	return response.json();
}

function acctToUsersShowBody(acct) {
	const { username, host } = parseAcct(acct);
	return host == null ? { username } : { username, host };
}

function parseAcct(acct) {
	const [username, ...hostParts] = acct.split('@');
	return { username, host: hostParts.length > 0 ? hostParts.join('@') : null };
}

function getInstanceName(request, env) {
	return env.INSTANCE_NAME || new URL(request.url).host;
}

function getNoteSummary(note) {
	if (note.cw) return note.cw;
	if (note.text) return note.text.length > 300 ? `${note.text.slice(0, 300)}…` : note.text;
	if ((note.files ?? []).length > 0) return `(${note.files.length} file${note.files.length === 1 ? '' : 's'})`;
	return '';
}

function isRenote(note) {
	return note.renote != null && note.text == null && note.fileIds?.length === 0 && note.poll == null;
}
