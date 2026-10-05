/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ api: vi.fn(), popup: vi.fn(), alert: vi.fn(), roomId: { value: null as string | null }, policies: { canJoinCalls: true } }));
vi.mock('@/i.js', () => ({ $i: { id: 'owner-a', policies: fixture.policies } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { somethingHappened: 'Error', _calls: { participationNotAllowed: 'Participation not allowed' } } } }));
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
	fixture.policies.canJoinCalls = true;
	fixture.alert.mockReset();
});

test('does not show creation when the role disallows participation', async () => {
	fixture.policies.canJoinCalls = false;
	await (await import('@/utility/calls-window.js')).openCallsCreation();
	expect(fixture.alert).toHaveBeenCalledWith({ type: 'error', text: 'Participation not allowed' });
	expect(fixture.api).not.toHaveBeenCalled();
	expect(fixture.popup).not.toHaveBeenCalled();
});

test('opens the joined room directly without looking up or creating a room', async () => {
	fixture.roomId.value = 'joined-room';
	await (await import('@/utility/calls-window.js')).openCallsCreation();
	expect(fixture.api).not.toHaveBeenCalled();
	expect(fixture.popup).toHaveBeenCalledWith('RoomWindow', { roomId: 'joined-room' }, expect.anything());
});

test.each(['open', 'scheduled'])('returns to the existing %s host room without showing creation', async state => {
	fixture.api.mockResolvedValue([{ id: 'existing-room', state, attachment: { type: 'personal', ownerUserId: 'owner-a' } }]);
	await (await import('@/utility/calls-window.js')).openCallsCreation();
	expect(fixture.popup).toHaveBeenCalledOnce();
	expect(fixture.popup).toHaveBeenCalledWith('RoomWindow', { roomId: 'existing-room' }, expect.anything());
});

test('shows creation when the available room belongs to someone else', async () => {
	fixture.api.mockResolvedValue([{ id: 'other-room', state: 'open', attachment: { type: 'personal', ownerUserId: 'other-user' } }]);
	await (await import('@/utility/calls-window.js')).openCallsCreation();
	expect(fixture.popup).toHaveBeenCalledWith('CreateDialog', {}, expect.anything());
});

test('dismisses and reopens the same room from its link without creating or joining a room', async () => {
	const { openCallsRoom, callsWindowRoomId } = await import('@/utility/calls-window.js');
	await openCallsRoom('ended-room');
	expect(callsWindowRoomId.value).toBe('ended-room');
	await openCallsRoom('ended-room');
	expect(fixture.popup).toHaveBeenCalledOnce();
	fixture.popup.mock.calls[0][2].closed();
	expect(callsWindowRoomId.value).toBeNull();
	await openCallsRoom('ended-room');
	expect(fixture.popup).toHaveBeenCalledTimes(2);
	expect(fixture.popup).toHaveBeenLastCalledWith('RoomWindow', { roomId: 'ended-room' }, expect.anything());
	expect(fixture.api).not.toHaveBeenCalled();
});
