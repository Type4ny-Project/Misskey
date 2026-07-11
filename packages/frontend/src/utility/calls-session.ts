/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, ref, shallowRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { createCallsRoomConnection } from '@/composables/use-calls-room.js';
import { $i } from '@/i.js';
import { CallsMediaController } from '@/utility/calls-media.js';
import type { CallsMediaFailure, CallsMediaState } from '@/utility/calls-media.js';
import { detectCallsMediaCapabilities } from '@/utility/calls-media-core.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type CallsRoomConnection = ReturnType<typeof createCallsRoomConnection>;

const currentRoomId = ref<string | null>(null);
const connection = shallowRef<CallsRoomConnection | null>(null);
const media = shallowRef<CallsMediaController | null>(null);
const mediaState = ref<CallsMediaState>('idle');
const mediaFailure = ref<CallsMediaFailure | null>(null);
const muted = ref(false);
const joining = ref(false);
const selectedMicrophone = ref('');
const microphones = ref<MediaDeviceInfo[]>([]);
const needsAudioResume = ref(false);
const usersById = shallowRef(new Map<string, Misskey.entities.UserLite>());
const remoteAudio = new Set<HTMLAudioElement>();

let removeTrackListener: (() => void) | null = null;
let removeRevokedListener: (() => void) | null = null;
let sessionGeneration = 0;

const room = computed(() => connection.value?.room.value ?? null);
const participants = computed(() => connection.value?.participants.value ?? []);
const speakingParticipantIds = computed(() => connection.value?.speakingParticipantIds.value ?? new Set<string>());
const connected = computed(() => connection.value?.connected.value ?? false);
const myParticipant = computed(() => participants.value.find(participant => participant.userId === $i?.id) ?? null);
const isActive = computed(() => currentRoomId.value != null && myParticipant.value != null && room.value?.state === 'open');
const isHost = computed(() => myParticipant.value?.role === 'host');
const isSpeaker = computed(() => myParticipant.value?.role === 'host' || myParticipant.value?.role === 'speaker');

function disposeConnection(): void {
	removeTrackListener?.();
	removeRevokedListener?.();
	removeTrackListener = null;
	removeRevokedListener = null;
	connection.value?.dispose();
	connection.value = null;
}

function addRemoteTrack(track: MediaStreamTrack): void {
	if ([...remoteAudio].some(audio => (audio.srcObject as MediaStream | null)?.getTracks().some(current => current.id === track.id))) return;
	const audio = new Audio();
	audio.autoplay = true;
	audio.hidden = true;
	audio.srcObject = new MediaStream([track]);
	remoteAudio.add(audio);
	window.document.body.append(audio);
	void audio.play().catch(() => { needsAudioResume.value = true; });
	track.addEventListener('ended', () => {
		remoteAudio.delete(audio);
		audio.remove();
	}, { once: true });
}

async function loadMicrophones(): Promise<void> {
	if (navigator.mediaDevices?.enumerateDevices == null) return;
	microphones.value = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
}

async function connectMedia(generation: number): Promise<void> {
	const participant = myParticipant.value;
	const targetRoomId = currentRoomId.value;
	if (participant == null || targetRoomId == null) return;
	await media.value?.close().catch(() => undefined);
	if (generation !== sessionGeneration) return;
	const controller = new CallsMediaController(
		targetRoomId,
		participant.role,
		(state, failure) => {
			if (generation !== sessionGeneration || media.value !== controller) return;
			mediaState.value = state;
			mediaFailure.value = failure;
		},
		addRemoteTrack,
		(_stats, speaking) => connection.value?.setSpeaking(speaking),
	);
	media.value = controller;
	await controller.connect(selectedMicrophone.value || undefined);
	if (generation !== sessionGeneration || media.value !== controller) {
		await controller.close().catch(() => undefined);
		return;
	}
	if (participant.role !== 'listener') await loadMicrophones();
}

async function clearSession(): Promise<void> {
	sessionGeneration += 1;
	const controller = media.value;
	media.value = null;
	await controller?.close().catch(() => undefined);
	disposeConnection();
	currentRoomId.value = null;
	mediaState.value = 'idle';
	mediaFailure.value = null;
	muted.value = false;
	microphones.value = [];
	usersById.value = new Map();
	for (const audio of remoteAudio) audio.remove();
	remoteAudio.clear();
}

function attachConnection(roomId: string): CallsRoomConnection {
	disposeConnection();
	const next = createCallsRoomConnection(roomId);
	connection.value = next;
	removeTrackListener = next.onTrackChange(() => { void media.value?.reconcile(); });
	removeRevokedListener = next.onRevoked(reason => {
		if (reason === 'stale-generation') void reconnectMedia();
		else if (reason === 'moderation' && myParticipant.value?.role === 'listener' && room.value?.state === 'open') void reconnectMedia();
		else void clearSession();
	});
	return next;
}

async function join(roomId: string, alreadyParticipant: boolean): Promise<void> {
	if (joining.value) return;
	const capabilities = detectCallsMediaCapabilities();
	if (!capabilities.secureContext || !capabilities.peerConnection || !capabilities.transceiver) {
		mediaState.value = 'failed';
		mediaFailure.value = 'unsupported';
		throw new Error('Calls is not supported by this browser');
	}

	joining.value = true;
	let joinedNow = false;
	let generation = sessionGeneration;
	try {
		if (currentRoomId.value != null && currentRoomId.value !== roomId) await leave();
		generation = ++sessionGeneration;
		currentRoomId.value = roomId;
		const next = attachConnection(roomId);
		await next.refresh();
		if (!alreadyParticipant) {
			await misskeyApi('calls/rooms/join', { roomId });
			joinedNow = true;
			await next.refresh();
		}
		if (myParticipant.value == null) throw new Error('Calls participant state was not created');
		await connectMedia(generation);
	} catch (error) {
		if (generation !== sessionGeneration) return;
		if (joinedNow) await misskeyApi('calls/rooms/leave', { roomId }).catch(() => undefined);
		await clearSession();
		throw error;
	} finally {
		joining.value = false;
	}
}

async function reconnectMedia(): Promise<void> {
	if (!isActive.value) return;
	const generation = ++sessionGeneration;
	const controller = media.value;
	media.value = null;
	await controller?.close().catch(() => undefined);
	if (generation !== sessionGeneration) return;
	await connectMedia(generation).catch(() => undefined);
}

async function leave(): Promise<void> {
	const targetRoom = room.value;
	const targetRoomId = currentRoomId.value;
	const targetIsHost = isHost.value;
	if (targetRoomId == null) return;
	await clearSession();
	if (targetIsHost && targetRoom?.state === 'open') {
		await misskeyApi('calls/rooms/end', { roomId: targetRoomId, expectedRevision: targetRoom.revision }).catch(() => undefined);
	} else {
		await misskeyApi('calls/rooms/leave', { roomId: targetRoomId }).catch(() => undefined);
	}
}

async function toggleMute(): Promise<void> {
	if (!isSpeaker.value) return;
	muted.value = !muted.value;
	media.value?.setMuted(muted.value);
	connection.value?.setMuted(muted.value);
}

async function requestSpeaker(): Promise<void> {
	if (currentRoomId.value == null || myParticipant.value?.role !== 'listener') return;
	await misskeyApi('calls/rooms/request-speaker', { roomId: currentRoomId.value });
}

async function switchMicrophone(deviceId: string): Promise<void> {
	selectedMicrophone.value = deviceId;
	await media.value?.switchMicrophone(deviceId);
}

async function resumeAudio(): Promise<void> {
	await Promise.all([...remoteAudio].map(audio => audio.play()));
	needsAudioResume.value = false;
}

watch(() => myParticipant.value?.isMuted, value => {
	if (value != null) muted.value = value;
});

watch(() => myParticipant.value?.role, (role, previousRole) => {
	if (previousRole === 'listener' && role === 'speaker' && room.value?.state === 'open') void reconnectMedia();
});

watch(() => room.value?.state, state => {
	if (state === 'ended' || state === 'cancelled') void clearSession();
});

watch(() => participants.value.map(participant => participant.userId), async userIds => {
	const missingIds = [...new Set(userIds)].filter(userId => !usersById.value.has(userId));
	if (missingIds.length === 0) return;
	const fetched = await Promise.all(missingIds.map(userId => misskeyApi('users/show', { userId }).catch(() => null)));
	const next = new Map(usersById.value);
	for (const user of fetched) if (user != null) next.set(user.id, user);
	usersById.value = next;
});

window.setInterval(() => {
	const identity = media.value?.connectionIdentity;
	if (identity != null) connection.value?.heartbeat(identity.connectionId, identity.generation);
}, 30_000);

export function useCallsSession() {
	return {
		currentRoomId,
		room,
		participants,
		speakingParticipantIds,
		connected,
		myParticipant,
		isActive,
		isHost,
		isSpeaker,
		joining,
		mediaState,
		mediaFailure,
		muted,
		selectedMicrophone,
		microphones,
		needsAudioResume,
		usersById,
		join,
		leave,
		toggleMute,
		requestSpeaker,
		switchMicrophone,
		resumeAudio,
		refresh() { return connection.value?.refresh() ?? Promise.resolve(); },
	};
}
