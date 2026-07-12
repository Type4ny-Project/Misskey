/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onUnmounted, ref, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';

type Snapshot = Misskey.entities.CallsRoomsShowResponse;
type EventBase = { sequence: number; roomRevision: number };

export function createCallsRoomConnection(roomId: string) {
	const room = shallowRef<Snapshot['room'] | null>(null);
	const participants = ref<Snapshot['participants']>([]);
	const connected = ref(false);
	const speakingParticipantIds = ref<Set<string>>(new Set());
	const lastSequence = ref(0);
	const lastRoomRevision = ref(0);
	const stream = useStream();
	const channel = stream.useChannel('callsRoom', { roomId });
	const trackListeners = new Set<() => void>();
	const revocationListeners = new Set<(reason: 'access' | 'moderation' | 'room-ended' | 'logout' | 'stale-generation') => void>();
	let ownParticipantId: string | null = null;
	let eventQueue = Promise.resolve();

	async function refresh() {
		const snapshot = await misskeyApi('calls/rooms/show', { roomId });
		if (room.value == null || snapshot.room.revision >= room.value.revision) {
			room.value = snapshot.room;
			participants.value = snapshot.participants;
		}
		lastRoomRevision.value = Math.max(lastRoomRevision.value, snapshot.room.revision);
		ownParticipantId ??= snapshot.participants.find(participant => participant.userId === $i?.id)?.id ?? null;
	}

	async function accept(event: EventBase, apply: () => void | Promise<void>) {
		if (event.sequence <= lastSequence.value) {
			if (event.roomRevision <= lastRoomRevision.value) return;
			await refresh();
			await misskeyApi('calls/media/reconcile', { roomId });
			lastSequence.value = event.sequence;
			if (event.roomRevision < lastRoomRevision.value) return;
			lastRoomRevision.value = event.roomRevision;
			await apply();
			return;
		}
		if (lastSequence.value !== 0 && event.sequence !== lastSequence.value + 1) {
			await refresh();
			await misskeyApi('calls/media/reconcile', { roomId });
		}
		lastSequence.value = event.sequence;
		if (event.roomRevision < lastRoomRevision.value) return;
		lastRoomRevision.value = Math.max(lastRoomRevision.value, event.roomRevision);
		await apply();
	}

	function enqueue(event: EventBase, apply: () => void | Promise<void>) {
		eventQueue = eventQueue.then(() => accept(event, apply)).catch(() => refresh());
	}

	function onStreamDisconnected() { connected.value = false; }

	function onStreamConnected() {
		connected.value = true;
		void refresh().then(() => misskeyApi('calls/media/reconcile', { roomId })).catch(() => undefined);
	}

	channel.on('lifecycle', event => enqueue(event, () => { if (room.value != null) room.value = { ...room.value, state: event.state, revision: event.roomRevision }; }));
	channel.on('participant', event => enqueue(event, () => { void refresh(); }));
	channel.on('role', event => enqueue(event, () => {
		participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, role: event.role } : participant);
		if (room.value != null) room.value = { ...room.value, revision: event.roomRevision };
	}));
	channel.on('speakerRequest', event => enqueue(event, () => { void refresh(); }));
	channel.on('mute', event => enqueue(event, () => { participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, isMuted: event.isMuted } : participant); }));
	channel.on('track', event => enqueue(event, () => { for (const listener of trackListeners) listener(); }));
	channel.on('speaking', event => enqueue(event, () => { speakingParticipantIds.value = new Set(event.participantIds); }));
	channel.on('revoked', event => enqueue(event, async () => {
		if (event.participantId != null && ownParticipantId == null) await refresh();
		if (event.participantId != null && event.participantId !== ownParticipantId) return;
		if (event.participantId == null) connected.value = false;
		for (const listener of revocationListeners) listener(event.reason);
	}));
	connected.value = stream.state === 'connected';
	stream.on('_disconnected_', onStreamDisconnected);
	stream.on('_connected_', onStreamConnected);

	function dispose() {
		stream.off('_disconnected_', onStreamDisconnected);
		stream.off('_connected_', onStreamConnected);
		channel.dispose();
	}

	return {
		room, participants, connected, speakingParticipantIds, refresh,
		setMuted(isMuted: boolean) { channel.send('mute', isMuted); },
		setSpeaking(speaking: boolean) { channel.send('speaking', speaking); },
		heartbeat(connectionId: string, generation: number) { channel.send('heartbeat', { connectionId, generation }); },
		onTrackChange(listener: () => void) { trackListeners.add(listener); return () => trackListeners.delete(listener); },
		onRevoked(listener: (reason: 'access' | 'moderation' | 'room-ended' | 'logout' | 'stale-generation') => void) { revocationListeners.add(listener); return () => revocationListeners.delete(listener); },
		dispose,
	};
}

export function useCallsRoom(roomId: string) {
	const connection = createCallsRoomConnection(roomId);
	onUnmounted(connection.dispose);
	return connection;
}
