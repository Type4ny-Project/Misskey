<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div>{{ i18n.ts._drawing.description }}</div>
	<MkInfo v-if="error" warn>{{ error }}</MkInfo>
	<MkInfo v-else-if="!connected" warn>{{ i18n.ts._drawing.disconnected }}</MkInfo>
	<MkInfo v-if="participationError && !error" warn>{{ participationError }}</MkInfo>
	<div v-if="room && !state && !error" class="_gaps">
		<template v-if="isHost && (room.state === 'open' || room.state === 'scheduled')">
			<MkSelect v-model="scope" :items="scopeItems"><template #label>{{ i18n.ts._drawing.scope }}</template></MkSelect>
			<MkButton primary :disabled="busy || !connected" @click="start">{{ i18n.ts._drawing.start }}</MkButton>
		</template>
		<MkInfo v-else>{{ i18n.ts._drawing.waiting }}</MkInfo>
	</div>
	<template v-if="state && !error">
		<MkInfo v-if="state.ended">{{ i18n.ts._drawing.ended }}</MkInfo>
		<div :class="$style.toolbar">
			<MkButton v-if="!joined && !state.ended" primary :disabled="busy || !connected" @click="join">{{ i18n.ts._drawing.join }}</MkButton>
			<MkButton v-if="joined && !state.ended" :disabled="busy" @click="leave">{{ i18n.ts._drawing.leave }}</MkButton>
			<label>{{ i18n.ts._drawing.color }} <input v-model="color" type="color" :disabled="!canDraw"></label>
			<label>{{ i18n.ts._drawing.width }} <input v-model.number="width" type="range" min="1" max="64" :disabled="!canDraw"> {{ width }}</label>
			<MkButton :disabled="!canDraw" :primary="!eraser" @click="eraser = false">{{ i18n.ts._drawing.pen }}</MkButton>
			<MkButton :disabled="!canDraw" :primary="eraser" @click="eraser = true">{{ i18n.ts._drawing.eraser }}</MkButton>
			<MkButton :disabled="busy || pending > 0" @click="save(false)">{{ i18n.ts._drawing.save }}</MkButton>
			<MkButton :disabled="busy || pending > 0" @click="save(true)">{{ i18n.ts._drawing.attach }}</MkButton>
			<MkButton v-if="isHost && !state.ended" danger :disabled="busy || !connected" @click="clear">{{ i18n.ts._drawing.clear }}</MkButton>
			<MkButton v-if="isHost && !state.ended" danger :disabled="busy || !connected" @click="end">{{ i18n.ts._drawing.end }}</MkButton>
		</div>
		<canvas ref="canvas" :style="{ '--MI_DRAWING-paper': DRAWING_PAPER_COLOR }" width="1280" height="720" :class="[$style.canvas, !canDraw && $style.disabled]" :aria-label="i18n.ts._drawing.title" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="pointerUp"></canvas>
		<div :class="$style.people">
			<strong>{{ i18n.ts._chat.members }} ({{ state.participantIds.length }}/16)</strong>
			<div v-for="userId in state.participantIds" :key="userId" :class="$style.person">
				<MkAvatar v-if="users.get(userId)" :user="users.get(userId)!" :class="$style.avatar"/>
				<MkUserName v-if="users.get(userId)" :user="users.get(userId)!"/><span v-else>{{ userId }}</span>
				<button v-if="isHost && userId !== $i.id && !state.ended" type="button" class="_button" :aria-label="i18n.ts._drawing.remove" @click="kick(userId)"><i class="ti ti-user-x"></i></button>
			</div>
		</div>
		<div v-if="chatRoom" class="_gaps">
			<MkA :to="`/chat/room/${chatRoom.id}`">{{ i18n.ts._chat.messages }}</MkA>
			<div v-for="message in chatMessages.slice(-20)" :key="message.id"><XMessage :message="message"/></div>
			<XForm v-if="!state.ended" :room="chatRoom"/>
		</div>
		<div v-else class="_gaps">
			<div v-for="message in state.messages" :key="message.id" :class="$style.message">
				<strong><MkUserName v-if="users.get(message.userId)" :user="users.get(message.userId)!"/><span v-else>{{ message.userId }}</span></strong>
				<span>{{ message.text }}</span>
			</div>
			<form :class="$style.toolbar" @submit.prevent="sendMessage">
				<MkInput v-model="text" :disabled="!canDraw || busy"><template #label>{{ i18n.ts.inputMessageHere }}</template><template #caption>{{ i18n.ts._drawing.messageLimit }}</template></MkInput>
				<MkButton :disabled="!canSend" type="submit">{{ i18n.ts.send }}</MkButton>
			</form>
		</div>
	</template>
</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue';
import { canvasBlob, DRAWING_PAPER_COLOR, paintStroke } from './drawing-canvas.js';
import type * as Misskey from 'misskey-js';
import type { DrawingSnapshot, DrawingStroke } from './drawing-canvas.js';
import XForm from '@/pages/chat/room.form.vue';
import XMessage from '@/pages/chat/XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { useStream } from '@/stream.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { uploadFile } from '@/utility/drive.js';
import * as os from '@/os.js';

const props = defineProps<{ room: Misskey.entities.CallsRoom }>();
const emit = defineEmits<{ (ev: 'refresh'): void }>();
const $i = ensureSignin();
const stream = useStream();
const canvas = useTemplateRef('canvas');
const room = computed(() => props.room);
const state = shallowRef<DrawingSnapshot | null>(null);
const chatRoom = shallowRef<Misskey.entities.ChatRoom | null>(null);
const chatMessages = ref<Misskey.entities.ChatMessage[]>([]);
const users = shallowRef(new Map<string, Misskey.entities.UserDetailed>());
const scope = ref<'public' | 'chatRoom' | 'calls'>('calls');
const scopeItems = computed(() => [
	...(room.value?.attachment.type === 'personal' && room.value.visibility === 'public' ? [{ value: 'public' as const, label: i18n.ts._drawing.public }] : []),
	...(room.value?.attachment.type === 'chatRoom' ? [{ value: 'chatRoom' as const, label: i18n.ts._drawing.chatRoom }] : []),
	{ value: 'calls' as const, label: i18n.ts._drawing.calls },
]);
const color = ref('#222222');
const width = ref(4);
const eraser = ref(false);
const text = ref('');
const error = ref('');
const participationError = ref('');
const busy = ref(false);
const pending = ref(0);
const connected = ref(stream.state === 'connected');
const isHost = computed(() => room.value?.attachment.ownerUserId === $i.id);
const joined = computed(() => state.value?.participantIds.includes($i.id) === true);
const canDraw = computed(() => room.value.state === 'open' && joined.value && state.value?.ended === false && connected.value && !error.value && !participationError.value && $i.policies.chatAvailability === 'available');
const canSend = computed(() => canDraw.value && !busy.value && text.value.trim().length > 0 && [...text.value].length <= 500);
let channel: Misskey.IChannelConnection<Misskey.Channels['drawing']> | null = null;
let chatChannel: Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null = null;
let poll: number | undefined;
let heartbeat: number | undefined;
let strokeTimer: number | undefined;
let active = false;
let refreshing = false;
let pointerId: number | null = null;
let points: number[][] = [];
let currentStroke: Pick<DrawingStroke, 'color' | 'width' | 'eraser'> | null = null;
let strokeQueue = Promise.resolve();
let eventQueue = Promise.resolve();

function drawSnapshot() {
	const context = canvas.value?.getContext('2d');
	if (!context) return;
	context.clearRect(0, 0, 1280, 720);
	for (const stroke of state.value?.strokes ?? []) paintStroke(context, stroke);
}

function showError(cause: unknown) {
	const failure = cause as { code?: string; kind?: string };
	if (!failure?.code || failure.kind === 'server') {
		connected.value = false;
		stopPointer();
		console.error(cause);
	} else if (failure.code === 'DRAWING_CANVAS_FULL') {
		void os.alert({ type: 'warning', text: i18n.ts._drawing.canvasFull });
	} else if (failure.code === 'DRAWING_INVALID_STATE') {
		void refresh();
	} else if (['DRAWING_ACCESS_DENIED', 'CALLS_ACCESS_DENIED', 'CALLS_ROOM_NOT_FOUND', 'CALLS_ATTACHMENT_NOT_FOUND', 'CALLS_FEATURE_DISABLED', 'FORBIDDEN'].includes(failure.code)) {
		error.value = i18n.ts._drawing.unavailable;
		stopPointer();
	} else {
		stopPointer();
		void os.alert({ type: 'warning', text: i18n.ts.somethingHappened });
	}
}

async function loadUsers() {
	const ids = [...new Set([...(state.value?.participantIds ?? []), ...(state.value?.messages.map(message => message.userId) ?? [])])].filter(id => !users.value.has(id));
	if (ids.length === 0) return;
	const result = await misskeyApi('users/show', { userIds: ids });
	users.value = new Map([...users.value, ...result.map(user => [user.id, user] as const)]);
}

async function refresh() {
	if (!active || refreshing) return;
	refreshing = true;
	try {
		const { canvas: snapshot } = await misskeyApi('drawing/show', { roomId: props.room.id });
		if (!active) return;
		const recovered = error.value !== '' || !connected.value;
		error.value = '';
		connected.value = stream.state === 'connected';
		if (snapshot && (!state.value || snapshot.version >= state.value.version)) {
			const changed = state.value?.version !== snapshot.version || recovered;
			state.value = snapshot;
			await nextTick();
			if (changed) drawSnapshot();
			void loadUsers().catch(console.error);
		}
	} catch (cause) { showError(cause); } finally { refreshing = false; }
}

async function update(action: 'join' | 'leave' | 'clear' | 'end' | 'kick' | 'message', params: { userId?: string; text?: string } = {}) {
	if (!state.value) return false;
	busy.value = true;
	if (action === 'join') participationError.value = '';
	try {
		await misskeyApi(`drawing/${action}`, { roomId: props.room.id, canvasId: state.value.canvasId, ...params } as never);
		await refresh();
		return true;
	} catch (cause) {
		if (action === 'join' && (cause as { code?: string })?.code) {
			participationError.value = i18n.ts._drawing.cannotJoin;
		} else { showError(cause); }
		return false;
	} finally { busy.value = false; }
}

async function start() {
	busy.value = true;
	try {
		if (room.value?.state === 'scheduled') {
			await misskeyApi('calls/rooms/open', { roomId: props.room.id, expectedRevision: room.value.revision });
			emit('refresh');
		}
		await misskeyApi('drawing/start', { roomId: props.room.id, scope: scope.value }); await refresh();
	} catch (cause) { showError(cause); } finally { busy.value = false; }
}

async function join() { await update('join'); }

async function leave() { stopPointer(); await strokeQueue; await update('leave'); }

async function clear() { if (!(await os.confirm({ type: 'warning', text: i18n.ts._drawing.clearConfirm })).canceled) { stopPointer(); await update('clear'); } }

async function end() { if (!(await os.confirm({ type: 'warning', text: i18n.ts._drawing.endConfirm })).canceled) { stopPointer(); await strokeQueue; await update('end'); } }

async function kick(userId: string) { if (!(await os.confirm({ type: 'warning', text: i18n.ts._drawing.removeConfirm })).canceled) await update('kick', { userId }); }

async function sendMessage() { if (canSend.value && await update('message', { text: text.value })) text.value = ''; }

function point(event: PointerEvent) {
	const rect = canvas.value!.getBoundingClientRect();
	return [Math.max(0, Math.min(1280, (event.clientX - rect.left) / rect.width * 1280)), Math.max(0, Math.min(720, (event.clientY - rect.top) / rect.height * 720))];
}

function pointerDown(event: PointerEvent) {
	if (!canDraw.value || event.button !== 0 || pointerId != null) return;
	pointerId = event.pointerId;
	currentStroke = { color: color.value, width: width.value, eraser: eraser.value };
	points = [point(event)];
	canvas.value!.setPointerCapture(event.pointerId);
	strokeTimer = window.setInterval(flushStroke, 250);
}

function pointerMove(event: PointerEvent) {
	if (event.pointerId !== pointerId || !canDraw.value) return;
	if (points.length < 64) points.push(point(event));
}

function flushStroke(final = false) {
	if (!state.value || !currentStroke || points.length === 0 || (!final && points.length < 2)) return;
	const stroke: DrawingStroke = { ...currentStroke, points: points.slice() };
	points = final ? [] : [points[points.length - 1]];
	const canvasId = state.value.canvasId;
	pending.value++;
	strokeQueue = strokeQueue.then(async () => {
		if (!active || !canDraw.value || state.value?.canvasId !== canvasId) return;
		try { await misskeyApi('drawing/stroke', { roomId: props.room.id, canvasId, stroke }); } catch (cause) {
			if ((cause as { code?: string }).code === 'DRAWING_INVALID_STATE') await refresh(); else showError(cause);
		}
	}).finally(() => { pending.value--; });
}

function stopPointer() { window.clearInterval(strokeTimer); pointerId = null; points = []; currentStroke = null; }

function pointerUp(event: PointerEvent) {
	if (event.pointerId !== pointerId) return;
	flushStroke(true);
	const captured = pointerId;
	stopPointer();
	if (captured != null && canvas.value?.hasPointerCapture(captured)) canvas.value.releasePointerCapture(captured);
}

async function save(attach: boolean) {
	if (!canvas.value) return;
	busy.value = true;
	try {
		await strokeQueue;
		await refresh();
		const blob = await canvasBlob(canvas.value);
		const file = await uploadFile(blob, { name: `drawing-${props.room.id}.png` }).filePromise;
		if (attach) await os.post({ initialFiles: [file] }); else os.success();
	} catch (cause) { console.error(cause); } finally { busy.value = false; }
}

function onUpdated(event: Parameters<Misskey.Channels['drawing']['events']['updated']>[0]) {
	eventQueue = eventQueue.then(async () => {
		if (!active || (state.value && event.version <= state.value.version)) return;
		if (!state.value || event.version !== state.value.version + 1) { await refresh(); return; }
		const changedCanvas = event.canvasId !== state.value.canvasId;
		if (changedCanvas || event.ended || !event.participantIds.includes($i.id)) stopPointer();
		state.value = { ...state.value, ...event, strokes: changedCanvas ? [] : [...state.value.strokes, ...(event.stroke ? [event.stroke] : [])], messages: [...state.value.messages, ...(event.message ? [event.message] : [])].slice(-50) };
		await nextTick();
		if (changedCanvas) drawSnapshot(); else if (event.stroke && canvas.value) paintStroke(canvas.value.getContext('2d')!, event.stroke);
		void loadUsers().catch(console.error);
	}).catch(showError);
}

function onConnected() { connected.value = true; void refresh(); }

function onDisconnected() { connected.value = false; stopPointer(); }

async function activate() {
	if (active) return;
	active = true;
	error.value = '';
	channel = stream.useChannel('drawing', { roomId: props.room.id });
	channel.on('updated', onUpdated);
	channel.on('revoked', () => { error.value = i18n.ts._drawing.unavailable; stopPointer(); });
	stream.on('_connected_', onConnected);
	stream.on('_disconnected_', onDisconnected);
	try {
		scope.value = room.value.attachment.type === 'chatRoom' ? 'chatRoom' : room.value.visibility === 'public' ? 'public' : 'calls';
		if (room.value.attachment.type === 'chatRoom') {
			const chat = await misskeyApi('chat/rooms/show', { roomId: room.value.attachment.chatRoomId });
			chatRoom.value = chat;
			chatMessages.value = (await misskeyApi('chat/messages/room-timeline', { roomId: chat.id, limit: 20 })).reverse();
			if (!active) return;
			chatChannel = stream.useChannel('chatRoom', { roomId: chat.id });
			chatChannel.on('message', message => {
				chatMessages.value.push(message as Misskey.entities.ChatMessage);
				if (message.fromUserId !== $i.id && active && !window.document.hidden) chatChannel?.send('read', { id: message.id });
			});
			chatChannel.on('deleted', id => { chatMessages.value = chatMessages.value.filter(message => message.id !== id); });
			chatChannel.on('react', event => {
				chatMessages.value.find(message => message.id === event.messageId)?.reactions.push({ reaction: event.reaction, user: event.user! });
			});
			chatChannel.on('unreact', event => {
				const message = chatMessages.value.find(message => message.id === event.messageId);
				if (message) message.reactions = message.reactions.filter(reaction => reaction.reaction !== event.reaction || reaction.user.id !== event.user!.id);
			});
		}
		await refresh();
		await nextTick();
		if (!active) return;
		drawSnapshot();
		if (state.value && !state.value.ended) await join();
	} catch (cause) { showError(cause); }
	if (!active) return;
	poll = window.setInterval(() => { if (!error.value) void refresh(); }, 15000);
	heartbeat = window.setInterval(() => { if (canDraw.value) void misskeyApi('drawing/join', { roomId: props.room.id, canvasId: state.value!.canvasId }).catch(showError); }, 30000);
}

function deactivate() {
	if (!active) return;
	active = false;
	stopPointer();
	if (joined.value && state.value && !state.value.ended) void misskeyApi('drawing/leave', { roomId: props.room.id, canvasId: state.value.canvasId }).catch(console.error);
	window.clearInterval(poll);
	window.clearInterval(heartbeat);
	channel?.dispose();
	chatChannel?.dispose();
	stream.off('_connected_', onConnected);
	stream.off('_disconnected_', onDisconnected);
}

onMounted(activate);
onBeforeUnmount(deactivate);
</script>

<style lang="scss" module>
.toolbar, .people { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.canvas { width: 100%; height: auto; touch-action: none; cursor: crosshair; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); background: var(--MI_DRAWING-paper); }
.disabled { cursor: default; }
.person { display: flex; align-items: center; gap: 6px; }
.avatar { width: 28px; height: 28px; }
.message { display: flex; gap: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
