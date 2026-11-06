<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkInfo>{{ i18n.ts._accountShortcuts.description }}</MkInfo>
	<div>{{ i18n.ts._accountShortcuts.instructions }}</div>
	<div v-for="action in accountShortcutActions" :key="action" class="_gaps_s">
		<div :id="`${id}-${action}`">{{ labels[action] }}</div>
		<div class="_buttons">
			<button
				type="button"
				class="_button"
				:class="$style.binding"
				:aria-labelledby="`${id}-${action} ${id}-${action}-value`"
				:aria-describedby="`${id}-help`"
				:aria-pressed="recording === action"
				@click="startRecording(action, $event)"
				@keydown="capture($event, action)"
				@blur="cancelRecording"
			>
				<span :id="`${id}-${action}-value`">{{ recording === action ? i18n.ts._accountShortcuts.recording : bindings[action] ? formatAccountShortcut(bindings[action]!) : i18n.ts._accountShortcuts.unassigned }}</span>
			</button>
			<button v-if="recording === action" type="button" class="_textButton" @click="cancelRecording">{{ i18n.ts.cancel }}</button>
			<button v-else-if="bindings[action]" type="button" class="_textButton" :aria-label="i18n.tsx._accountShortcuts.clearBinding({ action: labels[action] })" @click="clearBinding(action)">{{ i18n.ts.clear }}</button>
		</div>
	</div>
	<div :id="`${id}-help`">{{ i18n.ts._accountShortcuts.captureHelp }}</div>
	<div role="status" aria-live="polite">{{ status }}</div>
	<div v-if="error" role="alert">{{ error }}</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useId } from 'vue';
import type { AccountShortcutAction, AccountShortcuts } from '@/utility/account-shortcuts.js';
import MkInfo from '@/components/MkInfo.vue';
import { accountShortcutActions, findAccountShortcutConflict, formatAccountShortcut, parseAccountShortcut, shortcutFromEvent } from '@/utility/account-shortcuts.js';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const id = useId();
const bindings = computed<AccountShortcuts>(() => {
	const saved = prefer.r.accountShortcuts.value;
	const valid: AccountShortcuts = {};
	for (const action of accountShortcutActions) {
		if (parseAccountShortcut(saved?.[action]) != null) valid[action] = saved[action];
	}
	return valid;
});
const recording = ref<AccountShortcutAction | null>(null);
const error = ref('');
const status = ref('');
const labels = computed(() => ({
	timelineHome: i18n.ts._accountShortcuts.timelineHome,
	timelineLocal: i18n.ts._accountShortcuts.timelineLocal,
	timelineSocial: i18n.ts._accountShortcuts.timelineSocial,
	postVisibility: i18n.ts._accountShortcuts.postVisibility,
}));

function startRecording(action: AccountShortcutAction, ev: MouseEvent) {
	// Safari does not focus buttons on pointer clicks. Capture stays local to this button.
	if (ev.currentTarget instanceof HTMLElement) ev.currentTarget.focus();
	recording.value = action;
	error.value = '';
	status.value = i18n.ts._accountShortcuts.recording;
}

function cancelRecording() {
	recording.value = null;
	status.value = '';
	error.value = '';
}

function capture(ev: KeyboardEvent, action: AccountShortcutAction) {
	if (recording.value !== action) return;
	// Let the IME handle composition, including Escape, without invoking global hotkeys.
	if (ev.isComposing || ev.keyCode === 229) {
		ev.stopPropagation();
		return;
	}
	if (ev.key === 'Tab' || ev.key === 'Escape') {
		if (ev.key === 'Escape') {
			ev.preventDefault();
			ev.stopPropagation();
		}
		cancelRecording();
		return;
	}
	// Do not treat a held key as another capture.
	if (ev.repeat) {
		ev.stopPropagation();
		return;
	}
	ev.preventDefault();
	ev.stopPropagation();
	if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return;
	const shortcut = shortcutFromEvent(ev);
	if (shortcut == null) {
		error.value = i18n.ts._accountShortcuts.invalid;
		return;
	}
	const conflict = findAccountShortcutConflict(bindings.value, action, shortcut);
	if (conflict != null) {
		error.value = i18n.tsx._accountShortcuts.conflict({ action: labels.value[conflict] });
		return;
	}
	prefer.commit('accountShortcuts', { ...bindings.value, [action]: shortcut });
	recording.value = null;
	error.value = '';
	status.value = i18n.ts._accountShortcuts.saved;
}

function clearBinding(action: AccountShortcutAction) {
	const next = { ...bindings.value };
	delete next[action];
	prefer.commit('accountShortcuts', next);
	cancelRecording();
	error.value = '';
	status.value = i18n.ts._accountShortcuts.saved;
}

definePage(() => ({
	title: i18n.ts._accountShortcuts.title,
	icon: 'ti ti-keyboard',
}));
</script>

<style lang="scss" module>
.binding {
	padding: 10px 16px;
	border: 1px solid var(--MI_THEME-inputBorder);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-buttonBg);

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}
</style>
