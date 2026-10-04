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
export type CallsRevokedEvent = Parameters<Misskey.Channels['callsRoom']['events']['revoked']>[0];

export function createCallsRoomConnection(roomId: string) {
	const room = shallowRef<Snapshot['room'] | null>(null);
	const endReason = ref<'host-timeout' | null>(null);
	const participants = ref<Snapshot['participants']>([]);
	const connected = ref(false);
	const speakingParticipantIds = ref<Set<string>>(new Set());
	const lastSequence = ref(0);
	const lastRoomRevision = ref(0);
	const stream = useStream();
	const channel = stream.useChannel('callsRoom', { roomId });
	const trackListeners = new Set<() => void>();
	const revocationListeners = new Set<(event: CallsRevokedEvent) => void>();
	let ownParticipantId: string | null = null;

	async function refresh() {
		const snapshot = await misskeyApi('calls/rooms/show', { roomId });
		if (room.value == null || snapshot.room.revision >= room.value.revision) {
			room.value = snapshot.room;
			participants.value = snapshot.participants;
		}
		lastRoomRevision.value = Math.max(lastRoomRevision.value, snapshot.room.revision);
		ownParticipantId ??= snapshot.participants.find(participant => participant.userId === $i?.id)?.id ?? null;
	}

	function accept(event: EventBase, apply: () => void) {
		if (event.roomRevision < lastRoomRevision.value) return;
		if (event.sequence <= lastSequence.value && event.roomRevision <= lastRoomRevision.value) return;
		lastSequence.value = event.sequence;
		lastRoomRevision.value = event.roomRevision;
		if (room.value != null) room.value = { ...room.value, revision: event.roomRevision };
		apply();
	}

	function onStreamDisconnected() { connected.value = false; }

	function onStreamConnected() {
		connected.value = true;
	}

	channel.on('title', event => accept(event, () => {
		if (room.value != null) room.value = { ...room.value, title: event.title };
	}));
	channel.on('lifecycle', event => accept(event, () => {
		endReason.value = event.reason ?? null;
		if (room.value != null) room.value = { ...room.value, state: event.state, revision: event.roomRevision };
	}));
	channel.on('participant', event => accept(event, () => {
		if (room.value != null && event.moderatorUserIds != null) room.value = { ...room.value, moderatorUserIds: event.moderatorUserIds };
		if (event.action === 'left' || event.action === 'removed') {
			participants.value = participants.value.filter(participant => participant.id !== event.participantId);
		} else if (event.participant != null) {
			const next = event.participant;
			participants.value = participants.value.some(participant => participant.id === next.id)
				? participants.value.map(participant => participant.id === next.id ? next : participant)
				: [...participants.value, next];
			if (next.userId === $i?.id) ownParticipantId = next.id;
		}
	}));
	channel.on('role', event => accept(event, () => {
		participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, role: event.role } : participant);
		if (room.value != null) room.value = { ...room.value, revision: event.roomRevision };
	}));
	channel.on('speakerRequest', event => accept(event, () => {
		participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, speakerRequestedAt: event.requested ? event.occurredAt : null } : participant);
	}));
	channel.on('mute', event => accept(event, () => { participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, isMuted: event.isMuted } : participant); }));
	channel.on('track', event => accept(event, () => { for (const listener of trackListeners) listener(); }));
	channel.on('videoStopped', event => accept(event, () => { for (const listener of trackListeners) listener(); }));
	channel.on('speaking', event => accept(event, () => { speakingParticipantIds.value = new Set(event.participantIds); }));
	channel.on('revoked', event => accept(event, () => {
		if (event.participantId != null && event.participantId !== ownParticipantId) return;
		if (event.participantId == null) connected.value = false;
		for (const listener of revocationListeners) listener(event);
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
		room, endReason, participants, connected, speakingParticipantIds, refresh,
		setMuted(isMuted: boolean) { channel.send('mute', isMuted); },
		setSpeaking(speaking: boolean) { channel.send('speaking', speaking); },
		heartbeat(connectionId: string, generation: number) { channel.send('heartbeat', { connectionId, generation }); },
		onTrackChange(listener: () => void) { trackListeners.add(listener); return () => trackListeners.delete(listener); },
		onRevoked(listener: (event: CallsRevokedEvent) => void) { revocationListeners.add(listener); return () => revocationListeners.delete(listener); },
		dispose,
	};
}

// Display cards share a subscription without changing media session lifetimes.
const sharedCallsRooms = new Map<string, {
	connection: ReturnType<typeof createCallsRoomConnection>;
	referenceCount: number;
	loading: Promise<void> | null;
}>();

export function retainCallsRoomConnection(roomId: string) {
	let shared = sharedCallsRooms.get(roomId);
	if (shared == null) {
		shared = { connection: createCallsRoomConnection(roomId), referenceCount: 0, loading: null };
		sharedCallsRooms.set(roomId, shared);
	}
	const entry = shared;
	entry.referenceCount++;
	let disposed = false;
	return {
		room: entry.connection.room,
		participants: entry.connection.participants,
		speakingParticipantIds: entry.connection.speakingParticipantIds,
		load() {
			if (entry.connection.room.value != null) return Promise.resolve();
			return entry.loading ??= entry.connection.refresh().finally(() => { entry.loading = null; });
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			if (--entry.referenceCount === 0) {
				entry.connection.dispose();
				sharedCallsRooms.delete(roomId);
			}
		},
	};
}

export function useCallsRoom(roomId: string) {
	const connection = createCallsRoomConnection(roomId);
	onUnmounted(connection.dispose);
	return connection;
}
