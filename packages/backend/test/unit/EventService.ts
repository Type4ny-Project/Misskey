/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { EventService } from '@/core/EventService.js';
import type { EventEntityService } from '@/core/entities/EventEntityService.js';
import type { ChannelService } from '@/core/ChannelService.js';
import type { IdService } from '@/core/IdService.js';
import type { RoleService } from '@/core/RoleService.js';
import type { EventsRepository, ChannelsRepository, MiEvent } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import CreateEvent from '@/server/api/endpoints/events/create.js';
import UpdateEvent from '@/server/api/endpoints/events/update.js';

const startAt = new Date('2026-10-04T10:00:00Z');
const endAt = new Date('2026-10-04T11:00:00Z');
const user = { id: 'creator' } as MiLocalUser;

function createFixture() {
	const events = mock<EventsRepository>();
	const roles = mock<RoleService>();
	const ids = mock<IdService>();
	const entity = mock<EventEntityService>();
	const event = { id: 'event', createdById: user.id, startAt, endAt } as MiEvent;
	events.findOneBy.mockResolvedValue(event);
	events.findOneByOrFail.mockResolvedValue(event);
	events.countBy.mockResolvedValue(0);
	roles.isModerator.mockResolvedValue(false);
	ids.gen.mockReturnValue('event');
	const service = new EventService(events, mock<ChannelsRepository>(), mock<ChannelService>(), ids, roles);
	return { events, service, entity };
}

describe('Event time range validation', () => {
	test('create rejects an end before the start as an API error without saving', async () => {
		const { service, events, entity } = createFixture();
		const endpoint = new CreateEvent(entity, service);
		await expect(endpoint.exec({ title: 'Event', startAt: endAt.getTime(), endAt: startAt.getTime() }, user, null))
			.rejects.toMatchObject({ code: 'INVALID_EVENT_TIME_RANGE' });
		expect(events.insertOne).not.toHaveBeenCalled();
	});

	test.each([
		{ startAt: endAt.getTime() + 1 },
		{ endAt: startAt.getTime() - 1 },
		{ startAt: endAt.getTime(), endAt: startAt.getTime() },
	])('update checks the resulting range for %j without saving', async params => {
		const { service, events, entity } = createFixture();
		const endpoint = new UpdateEvent(service, entity);
		await expect(endpoint.exec({ eventId: 'event', ...params }, user, null))
			.rejects.toMatchObject({ code: 'INVALID_EVENT_TIME_RANGE' });
		expect(events.update).not.toHaveBeenCalled();
	});

	test.each([undefined, null, startAt, endAt])('create allows an omitted end, no end, an equal end, or a later end (%s)', async end => {
		const { service, events } = createFixture();
		await service.create({ user, title: 'Event', startAt, endAt: end });
		expect(events.insertOne).toHaveBeenCalledWith(expect.objectContaining({ startAt, endAt: end ?? null }));
	});

	test.each([
		{ startAt: endAt },
		{ endAt: null, startAt: new Date(endAt.getTime() + 1) },
		{ title: 'Updated title' },
	])('update allows an equal end, clearing the end, or leaving dates unchanged (%j)', async params => {
		const { service, events } = createFixture();
		await service.update(user, 'event', params);
		expect(events.update).toHaveBeenCalledWith('event', expect.objectContaining(params));
	});
});
