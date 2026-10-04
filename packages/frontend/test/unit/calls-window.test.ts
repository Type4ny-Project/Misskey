/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ api: vi.fn(), popup: vi.fn(), alert: vi.fn(), roomId: { value: null as string | null } }));
vi.mock('@/i.js', () => ({ $i: { id: 'owner-a' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { somethingHappened: 'Error' } } }));
vi.mock('@/os.js', () => ({ popup: fixture.popup, alert: fixture.alert }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: fixture.api }));
vi.mock('@/utility/calls-session.js', () => ({ useCallsSession: () => ({ currentRoomId: fixture.roomId }) }));
vi.mock('@/components/MkCallsCreateDialog.vue', () => ({ default: 'CreateDialog' }));
vi.mock('@/components/MkCallsRoomWindow.vue', () => ({ default: 'RoomWindow' }));

beforeEach(() => {
	vi.resetModules();
	fixture.api.mockReset().mockResolvedValue([]);
	fixture.popup.mockReset().mockReturnValue({ dispose: vi.fn() });
	fixture.roomId.value = null;
});

test('opens the joined room directly without looking up or creating a room', async () => {
	fixture.roomId.value = 'joined-room';
	await (await import('@/utility/calls-window.js')).openCallsCreation();
	expect(fixture.api).not.toHaveBeenCalled();
	expect(fixture.popup).toHaveBeenCalledWith('RoomWindow', { roomId: 'joined-room', join: false }, expect.anything());
});

test.each(['open', 'scheduled'])('returns to the existing %s host room without showing creation', async state => {
	fixture.api.mockResolvedValue([{ id: 'existing-room', state, attachment: { type: 'personal', ownerUserId: 'owner-a' } }]);
	await (await import('@/utility/calls-window.js')).openCallsCreation();
	expect(fixture.popup).toHaveBeenCalledOnce();
	expect(fixture.popup).toHaveBeenCalledWith('RoomWindow', { roomId: 'existing-room', join: state === 'open' }, expect.anything());
});

test('shows creation when the available room belongs to someone else', async () => {
	fixture.api.mockResolvedValue([{ id: 'other-room', state: 'open', attachment: { type: 'personal', ownerUserId: 'other-user' } }]);
	await (await import('@/utility/calls-window.js')).openCallsCreation();
	expect(fixture.popup).toHaveBeenCalledWith('CreateDialog', {}, expect.anything());
});
