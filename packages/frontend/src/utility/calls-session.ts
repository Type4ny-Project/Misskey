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
import { miLocalStorage } from '@/local-storage.js';
import { i18n } from '@/i18n.js';
import { confirm, toast } from '@/os.js';
import { misskeyApi, misskeyApiKeepalive } from '@/utility/misskey-api.js';

type CallsRoomConnection = ReturnType<typeof createCallsRoomConnection>;
type CallsReconnectCandidate = { roomId: string; title: string; userId: string; reconnectToken: string; expiresAt: number };
const reconnectStorageKey = 'miux:calls-reconnect' as const;

function safeRemoveReconnectCandidate(): void {
	try {
		miLocalStorage.removeItem(reconnectStorageKey);
	} catch {
		// localStorage can be unavailable in hardened browser modes.
	}
}

function loadReconnectCandidate(): CallsReconnectCandidate | null {
	let value: unknown;
	try {
		value = miLocalStorage.getItemAsJson(reconnectStorageKey);
	} catch {
		safeRemoveReconnectCandidate();
		return null;
	}
	if (typeof value !== 'object' || value == null) return null;
	const candidate = value as Partial<CallsReconnectCandidate>;
	if (typeof candidate.roomId !== 'string' || typeof candidate.title !== 'string' || typeof candidate.userId !== 'string' || typeof candidate.reconnectToken !== 'string' || typeof candidate.expiresAt !== 'number' || !Number.isFinite(candidate.expiresAt) || candidate.userId !== $i?.id || candidate.expiresAt <= Date.now()) {
		safeRemoveReconnectCandidate();
		return null;
	}
	return candidate as CallsReconnectCandidate;
}

const currentRoomId = ref<string | null>(null);
const connection = shallowRef<CallsRoomConnection | null>(null);
const media = shallowRef<CallsMediaController | null>(null);
const mediaState = ref<CallsMediaState>('idle');
const mediaFailure = ref<CallsMediaFailure | null>(null);
const muted = ref(false);
const joining = ref(false);
const replacedRoomId = ref<string | null>(null);
const selectedMicrophone = ref('');
const microphones = ref<MediaDeviceInfo[]>([]);
const needsAudioResume = ref(false);
const reconnectCandidate = ref<CallsReconnectCandidate | null>(null);
const reconnectRoomState = ref<'checking' | 'open' | 'unavailable'>('checking');
const reconnectSecondsRemaining = ref(0);
const speakerRequestResult = ref<'rejected' | null>(null);
const usersById = shallowRef(new Map<string, Misskey.entities.UserLite>());
const remoteAudio = new Set<HTMLAudioElement>();

let removeTrackListener: (() => void) | null = null;
let removeRevokedListener: (() => void) | null = null;
let sessionGeneration = 0;
let reconnectExpiryTimer: number | null = null;
let reconnectCountdownTimer: number | null = null;
let reconnectConnection: CallsRoomConnection | null = null;
let stopReconnectRoomWatch: (() => void) | null = null;
let cancelingSpeakerRequest = false;

function disposeReconnectConnection(): void {
	stopReconnectRoomWatch?.();
	stopReconnectRoomWatch = null;
	reconnectConnection?.dispose();
	reconnectConnection = null;
}

function updateReconnectCountdown(candidate: CallsReconnectCandidate): void {
	reconnectSecondsRemaining.value = Math.max(0, Math.ceil((candidate.expiresAt - Date.now()) / 1000));
}

function setReconnectCandidate(candidate: CallsReconnectCandidate | null): void {
	if (reconnectExpiryTimer != null) window.clearTimeout(reconnectExpiryTimer);
	if (reconnectCountdownTimer != null) window.clearInterval(reconnectCountdownTimer);
	disposeReconnectConnection();
	reconnectCandidate.value = candidate;
	reconnectSecondsRemaining.value = 0;
	reconnectRoomState.value = 'checking';
	if (candidate == null) return;

	updateReconnectCountdown(candidate);
	reconnectExpiryTimer = window.setTimeout(() => dismissReconnectCandidate(), Math.max(0, candidate.expiresAt - Date.now()));
	reconnectCountdownTimer = window.setInterval(() => updateReconnectCountdown(candidate), 1000);
	reconnectConnection = createCallsRoomConnection(candidate.roomId);
	stopReconnectRoomWatch = watch(reconnectConnection.room, room => {
		if (room == null) return;
		if (room.state !== 'open') {
			dismissReconnectCandidate();
			return;
		}
		reconnectRoomState.value = 'open';
	}, { immediate: true });
	void reconnectConnection.refresh().catch(() => {
		reconnectRoomState.value = 'unavailable';
		dismissReconnectCandidate();
	});
}

setReconnectCandidate(loadReconnectCandidate());

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
	if (!microphones.value.some(device => device.deviceId === selectedMicrophone.value)) {
		selectedMicrophone.value = microphones.value[0]?.deviceId ?? '';
	}
}

async function prepareMicrophones(): Promise<void> {
	await loadMicrophones();
}

async function connectMedia(generation: number, previousConnection?: { connectionId: string; generation: number }, replaceExisting = false): Promise<void> {
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
		previousConnection,
		replaceExisting,
	);
	media.value = controller;
	controller.setMuted(muted.value);
	await controller.connect(selectedMicrophone.value || undefined);
	controller.setMuted(muted.value);
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
	disposeConnection();
	currentRoomId.value = null;
	mediaState.value = 'idle';
	mediaFailure.value = null;
	muted.value = false;
	microphones.value = [];
	usersById.value = new Map();
	for (const audio of remoteAudio) audio.remove();
	remoteAudio.clear();
	needsAudioResume.value = false;
	await controller?.close().catch(() => undefined);
}

function attachConnection(roomId: string): CallsRoomConnection {
	disposeConnection();
	const next = createCallsRoomConnection(roomId);
	connection.value = next;
	removeTrackListener = next.onTrackChange(() => { void media.value?.reconcile(); });
	removeRevokedListener = next.onRevoked(event => {
		const identity = media.value?.connectionIdentity;
		if (event.connectionId != null && (identity?.connectionId !== event.connectionId || identity.generation !== event.generation)) return;
		const reason = event.reason;
		if (reason === 'replaced') {
			replacedRoomId.value = roomId;
			setReconnectCandidate(null);
			safeRemoveReconnectCandidate();
			void clearSession();
			toast(i18n.ts._calls.connectedOnAnotherDevice);
			return;
		}
		if (reason === 'stale-generation') void reconnectMedia();
		else if (reason === 'moderation' && myParticipant.value?.role === 'listener' && room.value?.state === 'open') void reconnectMedia();
		else void clearSession();
	});
	return next;
}

async function join(roomId: string, alreadyParticipant: boolean, reconnectToken?: string, startMuted = false): Promise<void> {
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
			await misskeyApi('calls/rooms/join', { roomId, reconnectToken });
			joinedNow = true;
			await next.refresh();
		}
		if (myParticipant.value == null) throw new Error('Calls participant state was not created');
		muted.value = myParticipant.value.isMuted;
		if (startMuted && myParticipant.value.role === 'host' && !muted.value) {
			muted.value = true;
		}
		try {
			await connectMedia(generation);
		} catch (error) {
			if (typeof error !== 'object' || error == null || !('code' in error) || error.code !== 'CALLS_CONNECTION_EXISTS') throw error;
			mediaFailure.value = null;
			const { canceled } = await confirm({ type: 'warning', text: i18n.ts._calls.switchDeviceConfirm });
			if (generation !== sessionGeneration) return;
			if (canceled) {
				await clearSession();
				return;
			}
			await connectMedia(generation, undefined, true);
		}
		if (generation !== sessionGeneration) return;
		replacedRoomId.value = null;
		if (startMuted && myParticipant.value?.role === 'host') next.setMuted(true);
		setReconnectCandidate(null);
		safeRemoveReconnectCandidate();
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
	const identity = controller?.connectionIdentity ?? undefined;
	media.value = null;
	await controller?.close().catch(() => undefined);
	if (generation !== sessionGeneration) return;
	await connectMedia(generation, identity).catch(() => undefined);
}

async function leave(): Promise<void> {
	const targetRoom = room.value;
	const targetRoomId = currentRoomId.value;
	const targetIsHost = isHost.value;
	const identity = media.value?.connectionIdentity;
	if (targetRoomId == null) return;
	setReconnectCandidate(null);
	safeRemoveReconnectCandidate();
	await clearSession();
	if (identity == null) return;
	if (targetIsHost && targetRoom?.state === 'open') {
		await misskeyApi('calls/rooms/end', { roomId: targetRoomId, expectedRevision: targetRoom.revision, ...identity }).catch(() => undefined);
	} else {
		await misskeyApi('calls/rooms/leave', { roomId: targetRoomId, ...identity }).catch(() => undefined);
	}
}

async function resumeRecentRoom(): Promise<void> {
	const candidate = reconnectCandidate.value;
	if (candidate == null || reconnectRoomState.value !== 'open') return;
	if (candidate.expiresAt <= Date.now()) {
		dismissReconnectCandidate();
		return;
	}
	await join(candidate.roomId, false, candidate.reconnectToken);
}

function dismissReconnectCandidate(): void {
	setReconnectCandidate(null);
	safeRemoveReconnectCandidate();
}

function onPageHide(event: PageTransitionEvent): void {
	if (event.persisted) return;
	const targetRoomId = currentRoomId.value;
	const targetRoom = room.value;
	const identity = media.value?.connectionIdentity;
	if (targetRoomId == null || targetRoom?.state !== 'open' || identity == null || $i == null) return;
	const candidate = { roomId: targetRoomId, title: targetRoom.title, userId: $i.id, reconnectToken: crypto.randomUUID(), expiresAt: Date.now() + 30_000 };
	misskeyApiKeepalive('calls/rooms/leave', { roomId: targetRoomId, reconnectToken: candidate.reconnectToken, connectionId: identity.connectionId, generation: identity.generation });
	try {
		miLocalStorage.setItemAsJson(reconnectStorageKey, candidate);
	} catch {
		// The transient leave must still be sent when storage is unavailable.
	}
}

function onReconnectStorage(event: StorageEvent): void {
	if (event.key === reconnectStorageKey) setReconnectCandidate(loadReconnectCandidate());
}

async function toggleMute(): Promise<void> {
	if (!isSpeaker.value) return;
	muted.value = !muted.value;
	media.value?.setMuted(muted.value);
	connection.value?.setMuted(muted.value);
}

async function requestSpeaker(): Promise<void> {
	if (currentRoomId.value == null || myParticipant.value?.role !== 'listener') return;
	speakerRequestResult.value = null;
	await misskeyApi('calls/rooms/request-speaker', { roomId: currentRoomId.value });
	await connection.value?.refresh();
}

async function cancelSpeakerRequest(): Promise<void> {
	if (currentRoomId.value == null || myParticipant.value?.speakerRequestedAt == null) return;
	cancelingSpeakerRequest = true;
	try {
		await misskeyApi('calls/rooms/cancel-speaker-request', { roomId: currentRoomId.value });
		await connection.value?.refresh();
	} finally {
		window.setTimeout(() => { cancelingSpeakerRequest = false; });
	}
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

watch(() => myParticipant.value?.speakerRequestedAt, (requestedAt, previousRequestedAt) => {
	if (!cancelingSpeakerRequest && previousRequestedAt != null && requestedAt == null && myParticipant.value?.role === 'listener') {
		speakerRequestResult.value = 'rejected';
		window.setTimeout(() => { speakerRequestResult.value = null; }, 5000);
	}
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

window.addEventListener('pagehide', onPageHide);
window.addEventListener('storage', onReconnectStorage);

window.setInterval(() => {
	const identity = media.value?.connectionIdentity;
	if (identity != null) connection.value?.heartbeat(identity.connectionId, identity.generation);
}, 10_000);

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
		replacedRoomId,
		mediaState,
		mediaFailure,
		muted,
		selectedMicrophone,
		microphones,
		needsAudioResume,
		reconnectCandidate,
		reconnectRoomState,
		reconnectSecondsRemaining,
		speakerRequestResult,
		usersById,
		join,
		leave,
		toggleMute,
		requestSpeaker,
		cancelSpeakerRequest,
		switchMicrophone,
		prepareMicrophones,
		resumeAudio,
		resumeRecentRoom,
		dismissReconnectCandidate,
		refresh() { return connection.value?.refresh() ?? Promise.resolve(); },
	};
}
