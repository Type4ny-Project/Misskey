<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="omfetrab _popup" :class="['s' + size, 'w' + width, 'h' + height, { asDrawer, asWindow }]" :style="{ maxHeight: maxHeight ? maxHeight + 'px' : undefined }">
	<input
		ref="searchEl"
		:value="q"
		class="search"
		data-prevent-emoji-insert
		:class="{ filled: q != null && q != '' }"
		:placeholder="i18n.ts.search"
		type="search"
		autocapitalize="off"
		@input="input()"
		@paste.stop="paste"
		@keydown="onKeydown"
	>
	<!-- FirefoxのTabフォーカスが想定外の挙動となるためtabindex="-1"を追加 https://github.com/misskey-dev/misskey/issues/10744 -->
	<div ref="emojisEl" class="emojis" tabindex="-1">
		<section class="result">
			<div v-if="searchResultCustom.length > 0" class="body">
				<button
					v-for="emoji in searchResultCustom"
					:key="emoji.name"
					class="_button item"
					:disabled="!canReact(emoji)"
					:title="emoji.name"
					tabindex="0"
					@pointerenter="(ev) => startPreview(`:${emoji.name}:`, ev)"
					@pointerleave="endPreview"
					@click="chosen(emoji, $event)"
				>
					<MkCustomEmoji class="emoji" :name="emoji.name" :fallbackToImage="true"/>
				</button>
			</div>
			<div v-if="searchResultUnicode.length > 0" class="body">
				<button
					v-for="emoji in searchResultUnicode"
					:key="emoji.name"
					class="_button item"
					:title="emoji.name"
					tabindex="0"
					@pointerenter="(ev) => startPreview(emoji.char, ev)"
					@pointerleave="endPreview"
					@click="chosen(emoji, $event)"
				>
					<MkEmoji class="emoji" :emoji="emoji.char"/>
				</button>
			</div>
		</section>

		<section v-if="q === '' && suggestedEmojis.length > 0" class="suggested">
			<header class="_acrylic"><i class="ti ti-sparkles ti-fw"></i> Suggested</header>
			<div class="body">
				<button
					v-for="emoji in suggestedEmojis"
					:key="emoji.name"
					:data-emoji="`:${emoji.name}:`"
					class="_button item suggestedItem"
					:disabled="!canReact(emoji)"
					:title="emoji.name"
					tabindex="0"
					@pointerenter="(ev) => startPreview(`:${emoji.name}:`, ev)"
					@pointerleave="endPreview"
					@click="chosen(emoji, $event)"
				>
					<MkCustomEmoji class="emoji" :name="emoji.name" :normal="true"/>
				</button>
			</div>
		</section>

		<div v-if="tab === 'index'" class="group index">
			<section v-if="showPinned && (pinned && pinned.length > 0)">
				<div class="body">
					<button
						v-for="emoji in pinnedEmojisDef"
						:key="getKey(emoji)"
						:data-emoji="getKey(emoji)"
						class="_button item"
						:disabled="!canReact(emoji)"
						tabindex="0"
						@pointerenter="(ev) => { startPreview(getKey(emoji), ev); computeButtonTitle(ev); }"
						@pointerleave="endPreview"
						@click="chosen(emoji, $event)"
					>
						<MkCustomEmoji v-if="!emoji.hasOwnProperty('char')" class="emoji" :name="getKey(emoji)" :normal="true"/>
						<MkEmoji v-else class="emoji" :emoji="getKey(emoji)" :normal="true"/>
					</button>
					<button v-tooltip="i18n.ts.settings" class="_button config" @click="settings"><i class="ti ti-settings"></i></button>
				</div>
			</section>

			<section>
				<header class="_acrylic"><i class="ti ti-clock ti-fw"></i> {{ i18n.ts.recentUsed }}</header>
				<div class="body">
					<button
						v-for="emoji in recentlyUsedEmojisDef"
						:key="getKey(emoji)"
						class="_button item"
						:disabled="!canReact(emoji)"
						:data-emoji="getKey(emoji)"
						@pointerenter="(ev) => { startPreview(getKey(emoji), ev); computeButtonTitle(ev); }"
						@pointerleave="endPreview"
						@click="chosen(emoji, $event)"
					>
						<MkCustomEmoji v-if="!emoji.hasOwnProperty('char')" class="emoji" :name="getKey(emoji)" :normal="true"/>
						<MkEmoji v-else class="emoji" :emoji="getKey(emoji)" :normal="true"/>
					</button>
				</div>
			</section>
		</div>
		<div v-once class="group">
			<header class="_acrylic">{{ i18n.ts.customEmojis }}</header>
			<XSection
				v-for="child in customEmojiFolderRoot.children"
				:key="`custom:${child.value}`"
				:initialShown="false"
				:emojis="computed(() => customEmojis.filter(e => filterCategory(e, child.value)).map(e => `:${e.name}:`))"
				:disabledEmojis="computed(() => customEmojis.filter(e => filterCategory(e, child.value)).filter(e => !canReact(e)).map(e => `:${e.name}:`))"
				:hasChildSection="child.children.length !== 0"
				:customEmojiTree="child.children"
				@chosen="chosen"
				@previewEnter="(emoji: string, ev: PointerEvent) => startPreview(emoji, ev)"
				@previewLeave="endPreview"
			>
				{{ child.value || i18n.ts.other }}
			</XSection>
		</div>
		<div v-once class="group">
			<header class="_acrylic">{{ i18n.ts.emoji }}</header>
			<XSection v-for="category in categories" :key="category" :emojis="emojiCharByCategory.get(category) ?? []" :hasChildSection="false" @chosen="chosen" @previewEnter="(emoji: string, ev: PointerEvent) => startPreview(emoji, ev)" @previewLeave="endPreview">{{ category }}</XSection>
		</div>
	</div>
	<div class="tabs">
		<button class="_button tab" :class="{ active: tab === 'index' }" @click="tab = 'index'"><i class="ti ti-asterisk ti-fw"></i></button>
		<button class="_button tab" :class="{ active: tab === 'custom' }" @click="tab = 'custom'"><i class="ti ti-mood-happy ti-fw"></i></button>
		<button class="_button tab" :class="{ active: tab === 'unicode' }" @click="tab = 'unicode'"><i class="ti ti-leaf ti-fw"></i></button>
		<button class="_button tab" :class="{ active: tab === 'tags' }" @click="tab = 'tags'"><i class="ti ti-hash ti-fw"></i></button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import {
	emojilist,
	emojiCharByCategory,
	unicodeEmojiCategories as categories,
	getEmojiName,
	getUnicodeEmoji,
} from '@@/js/emojilist.js';
import type {
	UnicodeEmojiDef,
	CustomEmojiFolderTree,
} from '@@/js/emojilist.js';
import XSection from '@/components/MkEmojiPicker.section.vue';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import * as os from '@/os.js';
import { isTouchUsing } from '@/utility/touch.js';
import { deviceKind } from '@/utility/device-kind.js';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import { customEmojiCategories, customEmojis, customEmojisMap, fetchCustomEmojis } from '@/custom-emojis.js';
import { $i } from '@/i.js';
import { checkReactionPermissions } from '@/utility/check-reaction-permissions.js';
import { prefer } from '@/preferences.js';
import { useRouter } from '@/router.js';
import { haptic } from '@/utility/haptic.js';
import { instance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const router = useRouter();
const PREVIEW_DELAY = 500;
const FALLBACK_SUGGESTION_LIMIT = 8;

type EmojiSuggestionItem = {
	name: string;
	score: number;
	aliases?: string[];
	category?: string | null;
};

type EmojiSuggestionResponse = {
	items: EmojiSuggestionItem[];
	reason?: string | null;
};

type EmojiSuggestionRequest = {
	noteId: Misskey.entities.Note['id'];
};

const props = withDefaults(defineProps<{
	showPinned?: boolean;
	pinnedEmojis?: string[];
	maxHeight?: number;
	asDrawer?: boolean;
	asWindow?: boolean;
	asReactionPicker?: boolean; // 今は使われてないが将来的に使いそう
	targetNote?: Misskey.entities.Note | null;
}>(), {
	showPinned: true,
});

const emit = defineEmits<{
	(ev: 'chosen', v: string): void;
	(ev: 'esc'): void;
}>();

let previewTimer: number | null = null;
let previewPopupDispose: (() => void) | null = null;
let closePreviewPopup: (() => void) | null = null;

function clearPreviewTimer(): void {
	if (previewTimer !== null) {
		window.clearTimeout(previewTimer);
		previewTimer = null;
	}
}

function hidePreviewPopup(): void {
	if (closePreviewPopup) {
		closePreviewPopup();
		closePreviewPopup = null;
	}
	previewPopupDispose = null;
}

function showPreviewPopup(emoji: string, anchorElement: HTMLElement): void {
	hidePreviewPopup();

	const showing = ref(true);
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkEmojiPreviewPopup.vue')), {
		showing,
		emoji,
		anchorElement,
	}, {
		closed: () => {
			if (previewPopupDispose === dispose) {
				previewPopupDispose = null;
				closePreviewPopup = null;
			}
			dispose();
		},
	});

	previewPopupDispose = dispose;
	closePreviewPopup = () => {
		showing.value = false;
	};
}

function startPreview(emoji: string, ev: PointerEvent): void {
	if (ev.pointerType === 'touch') return;

	const target = ev.currentTarget as HTMLElement | null;
	if (target == null) return;

	clearPreviewTimer();
	hidePreviewPopup();

	previewTimer = window.setTimeout(() => {
		showPreviewPopup(emoji, target);
	}, PREVIEW_DELAY);
}

function endPreview(): void {
	clearPreviewTimer();
	hidePreviewPopup();
}

const searchEl = useTemplateRef('searchEl');
const emojisEl = useTemplateRef('emojisEl');

const {
	emojiPickerScale,
	emojiPickerWidth,
	emojiPickerHeight,
} = prefer.r;

const recentlyUsedEmojis = store.r.recentlyUsedEmojis;

const recentlyUsedEmojisDef = computed(() => {
	return recentlyUsedEmojis.value.map(getDef);
});
const pinnedEmojisDef = computed(() => {
	return pinned.value?.map(getDef);
});

const pinned = computed(() => props.pinnedEmojis);
const size = computed(() => emojiPickerScale.value);
const width = computed(() => emojiPickerWidth.value);
const height = computed(() => emojiPickerHeight.value);
const q = ref<string>('');
const searchResultCustom = ref<Misskey.entities.EmojiSimple[]>([]);
const searchResultUnicode = ref<UnicodeEmojiDef[]>([]);
const suggestedEmojis = ref<Misskey.entities.EmojiSimple[]>([]);
const tab = ref<'index' | 'custom' | 'unicode' | 'tags'>('index');

let suggestionAbortController: AbortController | null = null;

const customEmojiFolderRoot: CustomEmojiFolderTree = { value: '', category: '', children: [] };

function parseAndMergeCategories(input: string, root: CustomEmojiFolderTree): CustomEmojiFolderTree {
	const parts = input.split('/').map(p => p.trim());
	let currentNode: CustomEmojiFolderTree = root;

	for (const part of parts) {
		let existingNode = currentNode.children.find((node) => node.value === part);

		if (!existingNode) {
			const newNode: CustomEmojiFolderTree = { value: part, category: input, children: [] };
			currentNode.children.push(newNode);
			existingNode = newNode;
		}

		currentNode = existingNode;
	}

	return currentNode;
}

customEmojiCategories.value.forEach(ec => {
	if (ec !== null) {
		parseAndMergeCategories(ec, customEmojiFolderRoot);
	}
});

parseAndMergeCategories('', customEmojiFolderRoot);

watch(q, () => {
	if (emojisEl.value) emojisEl.value.scrollTop = 0;

	if (q.value === '') {
		searchResultCustom.value = [];
		searchResultUnicode.value = [];
		return;
	}

	const newQ = q.value.replace(/:/g, '').toLowerCase();

	const searchCustom = () => {
		const max = 100;
		const emojis = customEmojis.value;
		const matches = new Set<Misskey.entities.EmojiSimple>();

		const exactMatch = emojis.find(emoji => emoji.name === newQ);
		if (exactMatch) matches.add(exactMatch);

		if (newQ.includes(' ')) { // AND検索
			const keywords = newQ.split(' ');

			// 名前にキーワードが含まれている
			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			// 名前またはエイリアスにキーワードが含まれている
			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword) || emoji.aliases.some(alias => alias.includes(keyword)))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
		} else {
			if (customEmojisMap.has(newQ)) {
				matches.add(customEmojisMap.get(newQ)!);
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias === newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.name.startsWith(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias.startsWith(newQ))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.name.includes(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const emoji of emojis) {
				if (emoji.aliases.some(alias => alias.includes(newQ))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
		}

		return matches;
	};

	const searchUnicode = () => {
		const max = 100;
		const emojis = emojilist;
		const matches = new Set<UnicodeEmojiDef>();

		const exactMatch = emojis.find(emoji => emoji.name === newQ);
		if (exactMatch) matches.add(exactMatch);

		if (newQ.includes(' ')) { // AND検索
			const keywords = newQ.split(' ');

			for (const emoji of emojis) {
				if (keywords.every(keyword => emoji.name.includes(keyword))) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				for (const emoji of emojis) {
					if (keywords.every(keyword => index[emoji.char]?.some(k => k.includes(keyword)))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}
		} else {
			for (const emoji of emojis) {
				if (emoji.name.startsWith(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				for (const emoji of emojis) {
					if (index[emoji.char]?.some(k => k.startsWith(newQ))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}

			for (const emoji of emojis) {
				if (emoji.name.includes(newQ)) {
					matches.add(emoji);
					if (matches.size >= max) break;
				}
			}
			if (matches.size >= max) return matches;

			for (const index of Object.values(store.s.additionalUnicodeEmojiIndexes)) {
				for (const emoji of emojis) {
					if (index[emoji.char]?.some(k => k.includes(newQ))) {
						matches.add(emoji);
						if (matches.size >= max) break;
					}
				}
			}
		}

		return matches;
	};

	searchResultCustom.value = Array.from(searchCustom());
	searchResultUnicode.value = Array.from(searchUnicode());
});

watch(() => [
	props.asReactionPicker,
	props.targetNote?.id,
	props.targetNote?.visibility,
	instance.emojiSuggestion?.enabled,
], () => {
	loadSuggestedEmojis();
}, {
	immediate: true,
});

function canReact(emoji: Misskey.entities.EmojiSimple | UnicodeEmojiDef | string): boolean {
	return !props.targetNote || checkReactionPermissions($i!, props.targetNote, emoji);
}

function canRequestSuggestions(): boolean {
	const note = props.targetNote;

	return props.asReactionPicker === true &&
		instance.emojiSuggestion?.enabled === true &&
		note != null &&
		(note.visibility === 'public' || note.visibility === 'home');
}

function clearSuggestionRequest(): void {
	if (suggestionAbortController !== null) {
		suggestionAbortController.abort();
		suggestionAbortController = null;
	}
}

function normalizeSuggestionItems(items: EmojiSuggestionItem[]): Misskey.entities.EmojiSimple[] {
	const max = Math.max(1, Math.min(instance.emojiSuggestion?.maxSuggestions ?? FALLBACK_SUGGESTION_LIMIT, 16));
	const seen = new Set<string>();
	const emojis: Misskey.entities.EmojiSimple[] = [];

	for (const item of items) {
		const name = item.name.replaceAll(':', '').trim();
		if (name === '' || seen.has(name)) continue;

		const emoji = customEmojisMap.get(name);
		if (emoji == null) continue;

		seen.add(name);
		emojis.push(emoji);
		if (emojis.length >= max) break;
	}

	return emojis;
}

async function normalizeSuggestionItemsWithRefresh(items: EmojiSuggestionItem[]): Promise<Misskey.entities.EmojiSimple[]> {
	const emojis = normalizeSuggestionItems(items);
	if (emojis.length > 0 || items.length === 0) return emojis;

	try {
		await fetchCustomEmojis(true);
	} catch (_err) {
		return emojis;
	}

	return normalizeSuggestionItems(items);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isEmojiSuggestionItem(value: unknown): value is EmojiSuggestionItem {
	return isRecord(value) &&
		typeof value.name === 'string' &&
		typeof value.score === 'number' &&
		(value.aliases == null || (Array.isArray(value.aliases) && value.aliases.every(alias => typeof alias === 'string'))) &&
		(value.category == null || typeof value.category === 'string');
}

function isEmojiSuggestionResponse(value: unknown): value is EmojiSuggestionResponse {
	return isRecord(value) &&
		Array.isArray(value.items) &&
		value.items.every(isEmojiSuggestionItem) &&
		(value.reason == null || typeof value.reason === 'string');
}

async function loadSuggestedEmojis(): Promise<void> {
	clearSuggestionRequest();
	suggestedEmojis.value = [];

	if (!canRequestSuggestions()) return;

	const noteId = props.targetNote!.id;
	const abortController = new AbortController();
	suggestionAbortController = abortController;

	try {
		const response: unknown = await misskeyApi('notes/reactions/suggestions', {
			noteId,
		} satisfies EmojiSuggestionRequest, undefined, abortController.signal);
		if (!isEmojiSuggestionResponse(response)) throw new Error('invalid emoji suggestion response');

		if (suggestionAbortController !== abortController) return;
		suggestedEmojis.value = (await normalizeSuggestionItemsWithRefresh(response.items ?? [])).filter(canReact);
	} catch {
		if (suggestionAbortController === abortController) {
			suggestedEmojis.value = [];
		}
	} finally {
		if (suggestionAbortController === abortController) {
			suggestionAbortController = null;
		}
	}
}

function filterCategory(emoji: Misskey.entities.EmojiSimple, category: string): boolean {
	return category === '' ? (emoji.category === 'null' || !emoji.category) : emoji.category === category;
}

function focus() {
	if (!['smartphone', 'tablet'].includes(deviceKind) && !isTouchUsing) {
		searchEl.value?.focus({
			preventScroll: true,
		});
	}
}

function reset() {
	if (emojisEl.value) emojisEl.value.scrollTop = 0;
	q.value = '';
}

function getKey(emoji: string | Misskey.entities.EmojiSimple | UnicodeEmojiDef): string {
	return typeof emoji === 'string' ? emoji : 'char' in emoji ? emoji.char : `:${emoji.name}:`;
}

function getDef(emoji: string): string | Misskey.entities.EmojiSimple | UnicodeEmojiDef {
	if (emoji.includes(':')) {
		// カスタム絵文字が存在する場合はその情報を持つオブジェクトを返し、
		// サーバの管理画面から削除された等で情報が見つからない場合は名前の文字列をそのまま返しておく（undefinedを返すとエラーになるため）
		const name = emoji.replaceAll(':', '');
		return customEmojisMap.get(name) ?? emoji;
	} else {
		return getUnicodeEmoji(emoji);
	}
}

/** @see MkEmojiPicker.section.vue */
function computeButtonTitle(ev: PointerEvent): void {
	const elm = ev.currentTarget as HTMLElement;
	const emoji = elm.dataset.emoji as string;
	elm.title = getEmojiName(emoji);
}

function chosen(emoji: string | Misskey.entities.EmojiSimple | UnicodeEmojiDef, ev?: PointerEvent) {
	endPreview();

	const el = ev && (ev.currentTarget ?? ev.target) as HTMLElement | null | undefined;
	if (el && prefer.s.animation) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		const { dispose } = os.popup(MkRippleEffect, { x, y }, {
			end: () => dispose(),
		});
	}

	const key = getKey(emoji);
	emit('chosen', key);

	haptic();

	// 最近使った絵文字更新
	if (!pinned.value?.includes(key)) {
		let recents = store.s.recentlyUsedEmojis;
		recents = recents.filter((emoji) => emoji !== key);
		recents.unshift(key);
		store.set('recentlyUsedEmojis', recents.splice(0, 32));
	}
}

function input(): void {
	// Using custom input event instead of v-model to respond immediately on
	// Android, where composition happens on all languages
	// (v-model does not update during composition)
	q.value = searchEl.value?.value.trim() ?? '';
}

function paste(event: ClipboardEvent): void {
	const pasted = event.clipboardData?.getData('text') ?? '';
	if (done(pasted)) {
		event.preventDefault();
	}
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.isComposing || ev.key === 'Process' || ev.keyCode === 229) return;
	if (ev.key === 'Enter') {
		ev.preventDefault();
		ev.stopPropagation();
		done();
	}
	if (ev.key === 'Escape') {
		ev.preventDefault();
		ev.stopPropagation();
		emit('esc');
	}
}

function done(query?: string): boolean | void {
	if (query == null) query = q.value;
	if (query == null || typeof query !== 'string') return;

	const q2 = query.replace(/:/g, '');
	const exactMatchCustom = customEmojisMap.get(q2);
	if (exactMatchCustom) {
		chosen(exactMatchCustom);
		return true;
	}
	const exactMatchUnicode = emojilist.find(emoji => emoji.char === q2 || emoji.name === q2);
	if (exactMatchUnicode) {
		chosen(exactMatchUnicode);
		return true;
	}
	if (searchResultCustom.value.length > 0) {
		chosen(searchResultCustom.value[0]);
		return true;
	}
	if (searchResultUnicode.value.length > 0) {
		chosen(searchResultUnicode.value[0]);
		return true;
	}
}

function settings() {
	emit('esc');
	router.push('/settings/emoji-palette');
}

onMounted(() => {
	focus();
});

onUnmounted(() => {
	endPreview();
	clearSuggestionRequest();
});

defineExpose({
	focus,
	reset,
});
</script>

<style lang="scss" scoped>
.omfetrab {
	$pad: 8px;

	display: flex;
	flex-direction: column;

	&.s1 {
		--eachSize: 40px;
	}

	&.s2 {
		--eachSize: 45px;
	}

	&.s3 {
		--eachSize: 50px;
	}

	&.s4 {
		--eachSize: 55px;
	}

	&.s5 {
		--eachSize: 60px;
	}

	&.w1 {
		--columns: 5;
	}

	&.w2 {
		--columns: 6;
	}

	&.w3 {
		--columns: 7;
	}

	&.w4 {
		--columns: 8;
	}

	&.w5 {
		--columns: 9;
	}

	&.h1 {
		--rows: 4;
	}

	&.h2 {
		--rows: 6;
	}

	&.h3 {
		--rows: 8;
	}

	&.h4 {
		--rows: 10;
	}

	width: calc((var(--eachSize) * var(--columns)) + (#{$pad} * 2));
	height: calc((var(--eachSize) * var(--rows)) + (#{$pad} * 2));

	&.asDrawer {
		width: 100% !important;

		> .emojis {
			::v-deep(section) {
				> header {
					height: 32px;
					line-height: 32px;
					padding: 0 12px;
					font-size: 15px;
				}

				> .body {
					display: grid;
					grid-template-columns: repeat(var(--columns), 1fr);
					font-size: 30px;

					> .config {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;
						font-size: 14px;
					}

					> .item {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;

						&.long-hover {
							z-index: 10;

							> .emoji {
								transform: scale(2);
								transition: transform 0.2s ease;
							}
						}

						&:disabled {
							cursor: not-allowed;
							background: linear-gradient(-45deg, transparent 0% 48%, light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.15)) 48% 52%, transparent 52% 100%);
							opacity: 1;

							> .emoji {
								filter: grayscale(1);
								mix-blend-mode: exclusion;
								opacity: 0.8;
							}
						}
					}
				}
			}
		}
	}

	&.asWindow {
		width: 100% !important;
		height: 100% !important;

		> .emojis {
			::v-deep(section) {
				> .body {
					display: grid;
					grid-template-columns: repeat(var(--columns), 1fr);
					font-size: 30px;

					> .item {
						aspect-ratio: 1 / 1;
						width: auto;
						height: auto;
						min-width: 0;
						padding: 0;

						&.long-hover {
							z-index: 10;

							> .emoji {
								transform: scale(2);
								transition: transform 0.2s ease;
							}
						}

						&:disabled {
							cursor: not-allowed;
							background: linear-gradient(-45deg, transparent 0% 48%, light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.15)) 48% 52%, transparent 52% 100%);
							opacity: 1;

							> .emoji {
								filter: grayscale(1);
								mix-blend-mode: exclusion;
								opacity: 0.8;
							}
						}
					}
				}
			}
		}
	}

	> .search {
		width: 100%;
		padding: 12px;
		box-sizing: border-box;
		font-size: 1em;
		outline: none;
		border: none;
		background: transparent;
		color: var(--MI_THEME-fg);

		&:not(:focus):not(.filled) {
			margin-bottom: env(safe-area-inset-bottom, 0px);
		}

		&:not(.filled) {
			order: 1;
			z-index: 2;
			box-shadow: 0px -1px 0 0px var(--MI_THEME-divider);
		}
	}

	> .tabs {
		display: flex;
		display: none;

		> .tab {
			flex: 1;
			height: 38px;
			border-top: solid 0.5px var(--MI_THEME-divider);

			&.active {
				border-top: solid 1px var(--MI_THEME-accent);
				color: var(--MI_THEME-accent);
			}
		}
	}

	> .emojis {
		height: 100%;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;

		> .group {
			&:not(.index) {
				padding: 4px 0 8px 0;
				border-top: solid 0.5px var(--MI_THEME-divider);
			}

			> header {
				/*position: sticky;
				top: 0;
				left: 0;*/
				height: 32px;
				line-height: 32px;
				z-index: 2;
				padding: 0 8px;
				font-size: 12px;
			}
		}

		::v-deep(section) {
			> header {
				position: sticky;
				top: 0;
				left: 0;
				line-height: 28px;
				z-index: 1;
				padding: 0 8px;
				font-size: 12px;
				cursor: pointer;

				&:hover {
					color: var(--MI_THEME-accent);
				}
			}

			> .body {
				position: relative;
				padding: $pad;

				> .config {
					position: relative;
					padding: 0 3px;
					width: var(--eachSize);
					height: var(--eachSize);
					contain: strict;
					opacity: 0.5;
				}

				> .item {
					position: relative;
					padding: 0 3px;
					width: var(--eachSize);
					height: var(--eachSize);
					contain: strict;
					border-radius: 4px;
					font-size: 24px;

					&:hover {
						background: rgba(0, 0, 0, 0.05);
					}

					&.long-hover {
						z-index: 10;

						> .emoji {
							transform: scale(2);
							transition: transform 0.2s ease;
						}
					}

					&:active {
						background: var(--MI_THEME-accent);
						box-shadow: inset 0 0.15em 0.3em rgba(27, 31, 35, 0.15);
					}

					&:disabled {
						cursor: not-allowed;
						background: linear-gradient(-45deg, transparent 0% 48%, light-dark(rgba(0, 0, 0, 0.25), rgba(255, 255, 255, 0.15)) 48% 52%, transparent 52% 100%);
						opacity: 1;

						> .emoji {
							filter: grayscale(1);
							mix-blend-mode: exclusion;
							opacity: 0.8;
						}
					}

					> .emoji {
						height: 1.25em;
						vertical-align: -.25em;
						pointer-events: none;
						width: 100%;
						object-fit: contain;
					}
				}
			}

			&.result {
				border-bottom: solid 0.5px var(--MI_THEME-divider);

				&:empty {
					display: none;
				}
			}

			&.suggested {
				border-bottom: solid 0.5px var(--MI_THEME-divider);
				background: linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent), transparent 56%);

				> header {
					color: var(--MI_THEME-accent);
				}

				> .body {
					padding-top: 4px;
					padding-bottom: 6px;

					> .suggestedItem {
						border-radius: 10px;

						&:hover {
							background: color-mix(in srgb, var(--MI_THEME-accent) 16%, transparent);
						}
					}
				}
			}
		}
	}
}
</style>
