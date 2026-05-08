/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from '@/misc/json-schema.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { CommonProps } from '@/server/web/views/_.js';
import { Layout } from '@/server/web/views/base.js';

export function UserStatsPage(props: CommonProps<{
	user: Packed<'UserDetailed'>;
	profile: MiUserProfile;
	weekKey: string;
}>) {
	const acct = `@${props.user.username}${props.user.host ? `@${props.user.host}` : ''}`;
	const title = `Weekly Stats - ${acct}`;
	const description = `${acct} の今週のサマリー`;
	const statsUrl = `${props.config.url}/@${props.user.username}/stats`;
	const imageUrl = `${props.config.url}/@${props.user.username}/stats.png?week=${props.weekKey}`;

	function ogBlock() {
		return (
			<>
				<meta property="og:type" content="website" />
				<meta property="og:title" content={title} />
				<meta property="og:description" content={description} />
				<meta property="og:url" content={statsUrl} />
				<meta property="og:image" content={imageUrl} />
				<meta property="og:image:width" content="1200" />
				<meta property="og:image:height" content="630" />
				<meta property="twitter:card" content="summary_large_image" />
			</>
		);
	}

	function metaBlock() {
		return (
			<>
				{props.user.host != null || props.profile.noCrawle ? <meta name="robots" content="noindex" /> : null}
				{props.profile.preventAiLearning ? (
					<>
						<meta name="robots" content="noimageai" />
						<meta name="robots" content="noai" />
					</>
				) : null}
				<meta name="misskey:user-username" content={props.user.username} />
				<meta name="misskey:user-id" content={props.user.id} />
			</>
		);
	}

	return (
		<Layout
			{...props}
			title={`${title} | ${props.instanceName}`}
			desc={description}
			metaSlot={metaBlock()}
			ogSlot={ogBlock()}
		>
		</Layout>
	);
}
