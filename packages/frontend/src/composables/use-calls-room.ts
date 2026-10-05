/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onUnmounted, ref, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';

type Snapshot = Misskey.entities.CallsRoomsShowResponse;
type EventBase = { sequence: number; roomRevision: number };
export type CallsRevokedEvent = Parameters<Misskey.Channels['callsRoom']['events']['revoked']>[0];

const SPEAKING_REFRESH_INTERVAL_MS = 750;

export function createCallsRoomConnection(roomId: string) {
	const room = shallowRef<Snapshot['room'] | null>(null);
	const endReason = ref<'host-timeout' | null>(null);
	const participants = ref<Snapshot['participants']>([]);
	const mutedParticipantIds = computed(() => new Set(participants.value.filter(participant => participant.isMuted).map(participant => participant.id)));
	const connected = ref(false);
	const speakingParticipantIds = ref<Set<string>>(new Set());
	const lastSequence = ref(0);
	const lastRoomRevision = ref(0);
	const stream = useStream();
	const channel = stream.useChannel('callsRoom', { roomId });
	const trackListeners = new Set<() => void>();
	const revocationListeners = new Set<(event: CallsRevokedEvent) => void>();
	let ownParticipantId: string | null = null;
	let lastSentSpeaking: boolean | null = null;
	let lastSpeakingSentAt = 0;

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
		if (room.value != null && room.value.revision !== event.roomRevision) room.value = { ...room.value, revision: event.roomRevision };
		apply();
	}

	function resetSpeakingSendGate(): void {
		lastSentSpeaking = null;
		lastSpeakingSentAt = 0;
	}

	function setSpeaking(speaking: boolean): void {
		const now = performance.now();
		const changed = lastSentSpeaking !== speaking;
		// Stats arrive every 500ms; leave margin before the server's 1.5s speaking expiry.
		// Refresh silence too so the server clears stale speakers and retries locked broadcasts.
		const refresh = now - lastSpeakingSentAt >= SPEAKING_REFRESH_INTERVAL_MS;
		if (!changed && !refresh) return;
		channel.send('speaking', speaking);
		lastSentSpeaking = speaking;
		lastSpeakingSentAt = now;
	}

	function onStreamDisconnected() {
		resetSpeakingSendGate();
		connected.value = false;
	}

	function onStreamConnected() {
		resetSpeakingSendGate();
		connected.value = true;
		void refresh().then(() => {
			if (room.value?.state !== 'open') return;
			for (const listener of trackListeners) listener();
		}).catch(() => undefined);
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
			if (event.action === 'updated' && next.role === 'host') void refresh().catch(() => undefined);
		}
	}));
	channel.on('role', event => accept(event, () => {
		participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, role: event.role } : participant);
		if (room.value != null) room.value = { ...room.value, revision: event.roomRevision };
	}));
	channel.on('speakerRequest', event => accept(event, () => {
		participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, speakerRequestedAt: event.requested ? event.occurredAt : null } : participant);
	}));
	channel.on('mute', event => accept(event, () => {
		if (event.participantId === ownParticipantId) resetSpeakingSendGate();
		participants.value = participants.value.map(participant => participant.id === event.participantId ? { ...participant, isMuted: event.isMuted } : participant);
		if (event.isMuted && speakingParticipantIds.value.has(event.participantId)) {
			const nextParticipantIds = new Set(speakingParticipantIds.value);
			nextParticipantIds.delete(event.participantId);
			speakingParticipantIds.value = nextParticipantIds;
		}
	}));
	channel.on('track', event => accept(event, () => { for (const listener of trackListeners) listener(); }));
	channel.on('videoStopped', event => accept(event, () => { for (const listener of trackListeners) listener(); }));
	channel.on('speaking', event => accept(event, () => {
		// A speaking aggregate can still contain an ID briefly after its mute event.
		const participantIds = mutedParticipantIds.value.size === 0 ? event.participantIds : event.participantIds.filter(participantId => !mutedParticipantIds.value.has(participantId));
		const currentParticipantIds = speakingParticipantIds.value;
		if (currentParticipantIds.size === participantIds.length && participantIds.every(participantId => currentParticipantIds.has(participantId))) return;
		speakingParticipantIds.value = new Set(participantIds);
	}));
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
		setMuted(isMuted: boolean) { resetSpeakingSendGate(); channel.send('mute', isMuted); },
		setSpeaking,
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
