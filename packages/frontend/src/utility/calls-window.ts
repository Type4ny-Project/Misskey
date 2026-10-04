/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { shallowRef } from 'vue';
import * as os from '@/os.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useCallsSession } from '@/utility/calls-session.js';

export const callsWindowRoomId = shallowRef<string | null>(null);
let disposeRoomWindow: (() => void) | null = null;
let creationOpen = false;
let roomPopoutWindow: Window | null = null;

export async function openCallsRoom(roomId: string, join = false): Promise<void> {
	if (callsWindowRoomId.value === roomId) {
		roomPopoutWindow?.focus();
		return;
	}
	const { default: RoomWindow } = await import('@/components/MkCallsRoomWindow.vue');
	disposeRoomWindow?.();
	callsWindowRoomId.value = roomId;
	const { dispose } = os.popup(RoomWindow, { roomId, join }, { popout(popup) { if (callsWindowRoomId.value === roomId) roomPopoutWindow = popup; }, closed() {
		dispose();
		if (callsWindowRoomId.value === roomId) {
			callsWindowRoomId.value = null;
			disposeRoomWindow = null;
			roomPopoutWindow = null;
		}
	} });
	disposeRoomWindow = dispose;
}

export async function openCallsCreation(): Promise<void> {
	const session = useCallsSession();
	if (session.currentRoomId.value != null) {
		await openCallsRoom(session.currentRoomId.value);
		return;
	}
	if (creationOpen) return;
	creationOpen = true;
	try {
		const rooms = await misskeyApi('calls/rooms/list', { limit: 100, states: ['open', 'scheduled'] });
		const existingRoom = rooms.find(room => room.attachment.type === 'personal' && room.attachment.ownerUserId === $i?.id);
		if (existingRoom != null) {
			await openCallsRoom(existingRoom.id, existingRoom.state === 'open');
			creationOpen = false;
			return;
		}
		const { default: CreateDialog } = await import('@/components/MkCallsCreateDialog.vue');
		const { dispose } = os.popup(CreateDialog, {}, { closed() { creationOpen = false; dispose(); } });
	} catch (error) {
		creationOpen = false;
		console.error('[Calls] Room creation opening failed', error);
		await os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}
