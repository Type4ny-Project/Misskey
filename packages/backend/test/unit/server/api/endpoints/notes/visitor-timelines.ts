/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import type { RolePolicies, RoleService } from '@/core/RoleService.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiMeta, NotesRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import LocalTimeline from '@/server/api/endpoints/notes/local-timeline.js';
import MediaTimeline from '@/server/api/endpoints/notes/media-timeline.js';

function setup(Endpoint: typeof LocalTimeline | typeof MediaTimeline) {
	const settings = mock<MiMeta>({ ugcVisibilityForVisitor: 'none', enableFanoutTimeline: true });
	const notes = mock<NotesRepository>();
	const roles = mock<RoleService>();
	const policies = mock<RolePolicies>({ ltlAvailable: true });
	roles.getUserPolicies.mockResolvedValue(policies);
	const fanout = mock<FanoutTimelineEndpointService>();
	const endpoint = new Endpoint(settings, notes, mock(), roles, mock(), mock(), fanout, mock(), mock());
	return { endpoint, settings, notes, policies, fanout };
}

describe.each([
	['notes/local-timeline', LocalTimeline],
	['notes/media-timeline', MediaTimeline],
] as const)('%s', (_, Endpoint) => {
	test.each([true, false])('skips timeline reads for hidden visitor content (fanout: %s)', async enabled => {
		const { endpoint, settings, notes, fanout } = setup(Endpoint);
		settings.enableFanoutTimeline = enabled;

		await expect(endpoint.exec({}, null, null)).resolves.toEqual([]);
		expect(notes.createQueryBuilder).not.toHaveBeenCalled();
		expect(fanout.timeline).not.toHaveBeenCalled();
	});

	test.each([
		['local', false],
		['all', false],
		['none', true],
	] as const)('still serves eligible readers (visibility: %s, signed in: %s)', async (visibility, signedIn) => {
		const { endpoint, settings, fanout } = setup(Endpoint);
		settings.ugcVisibilityForVisitor = visibility;
		const me = signedIn ? mock<MiLocalUser>({ id: 'member' }) : null;
		const timeline = [mock<Packed<'Note'>>({ id: 'note1' })];
		fanout.timeline.mockResolvedValue(timeline);

		await expect(endpoint.exec({}, me, null)).resolves.toBe(timeline);
	});

	test('preserves the disabled timeline error for visitors', async () => {
		const { endpoint, policies } = setup(Endpoint);
		policies.ltlAvailable = false;
		await expect(endpoint.exec({}, null, null)).rejects.toMatchObject({ code: 'LTL_DISABLED' });
	});
});

test('notes/local-timeline preserves the incompatible options error for visitors', async () => {
	const { endpoint } = setup(LocalTimeline);
	await expect(endpoint.exec({ withFiles: true, withReplies: true }, null, null))
		.rejects.toMatchObject({ code: 'BOTH_WITH_REPLIES_AND_WITH_FILES' });
});
