/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onUnmounted, ref, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type Snapshot = Misskey.entities.CallsRoomsShowResponse;
type EventBase = { sequence: number; roomRevision: number };

export function useCallsRoom(roomId: string) {
	const room = shallowRef<Snapshot['room'] | null>(null);
	const participants = ref<Snapshot['participants']>([]);
	const connected = ref(false);
	const lastSequence = ref(0);
	const channel = useStream().useChannel('callsRoom', { roomId });
	const trackListeners = new Set<() => void>();

	async function refresh() {
		const snapshot = await misskeyApi('calls/rooms/show', { roomId });
		room.value = snapshot.room;
		participants.value = snapshot.participants;
	}

	async function accept(event: EventBase, apply: () => void) {
		if (lastSequence.value !== 0 && event.sequence !== lastSequence.value + 1) {
			await refresh();
			await misskeyApi('calls/media/reconcile', { roomId });
		}
		lastSequence.value = event.sequence;
		apply();
	}

	channel.on('lifecycle', event => void accept(event, () => { if (room.value != null) room.value = { ...room.value, state: event.state, revision: event.roomRevision }; }));
	channel.on('participant', event => void accept(event, () => { void refresh(); }));
	channel.on('role', event => void accept(event, () => {
		participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, role: event.role } : participant);
		if (room.value != null) room.value = { ...room.value, revision: event.roomRevision };
	}));
	channel.on('speakerRequest', event => void accept(event, () => { void refresh(); }));
	channel.on('mute', event => void accept(event, () => { participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, isMuted: event.isMuted } : participant); }));
	channel.on('track', event => void accept(event, () => { for (const listener of trackListeners) listener(); }));
	channel.on('speaking', event => void accept(event, () => undefined));
	channel.on('revoked', event => void accept(event, () => { connected.value = false; }));
	connected.value = true;

	onUnmounted(() => channel.dispose());

	return {
		room, participants, connected, refresh,
		onTrackChange(listener: () => void) { trackListeners.add(listener); return () => trackListeners.delete(listener); },
	};
}
