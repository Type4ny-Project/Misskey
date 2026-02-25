<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->
<template>
<div class="_gaps_m">
	<FormSlot>
		<template #label>{{ i18n.ts.timelineHeader }}</template>
		<MkContainer :showHeader="false">
			<div style="overflow-x: auto;">
				<MkDraggable v-model="items" direction="vertical" withGaps>
					<template #default="{ item, index }">
						<div :class="$style.item">
							<button class="_button" :class="$style.itemHandle"><i class="ti ti-menu"></i></button>
							<i class="ti-fw" :class="[$style.itemIcon, timelineHeaderItemDef?.[item.type]?.icon]"></i><span :class="$style.itemText">{{ timelineHeaderItemDef?.[item.type]?.title }}</span>
							<button class="_button" :class="$style.itemRemove" @click="removeItem(index)"><i class="ti ti-x"></i></button>
						</div>
					</template>
				</MkDraggable>
			</div>
		</MkContainer>
	</FormSlot>
	<div class="_buttons">
		<MkButton @click="addItem"><i class="ti ti-plus"></i> {{ i18n.ts.addItem }}</MkButton>
		<MkButton danger @click="reset"><i class="ti ti-reload"></i> {{ i18n.ts.default }}</MkButton>
		<MkButton primary class="save" @click="save"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import FormSlot from '@/components/form/slot.vue';
import MkContainer from '@/components/MkContainer.vue';
import * as os from '@/os.js';
import { store } from '@/store.js';
import { unisonReload } from '@/utility/unison-reload.js';
import { i18n } from '@/i18n.js';
import { timelineHeaderItemDef } from '@/timeline-header.js';
import MkDraggable from '@/components/MkDraggable.vue';

const items = ref(store.s.timelineHeader.map(x => ({
	id: Math.random().toString(),
	type: x,
})));

async function reloadAsk() {
	const { canceled } = await os.confirm({
		type: 'info',
		text: i18n.ts.reloadToApplySetting,
	});
	if (canceled) return;
	unisonReload();
}

const menuItems = computed(() => {
	const used = new Set(items.value.map(x => x.type));
	return Object.keys(timelineHeaderItemDef).filter(k => !used.has(k));
});

console.log(timelineHeaderItemDef);
console.log(menuItems.value);

async function addItem() {
	const { canceled, result: item } = await os.select({
		title: i18n.ts.addItem,
		items: [...menuItems.value.map(k => ({
			value: k, label: timelineHeaderItemDef[k]?.title,
		}))],
	});
	if (canceled) return;
	items.value = [...items.value, {
		id: Math.random().toString(),
		type: item,
	}];
}

function removeItem(index: number) {
	items.value.splice(index, 1);
}

async function save() {
	store.set('timelineHeader', items.value.map(x => x.type));
	await reloadAsk();
}

function reset() {
	items.value = store.def.timelineHeader.default.map(x => ({
		id: Math.random().toString(),
		type: x,
	}));
}
</script>

<style lang="scss" module>
.item {
	position: relative;
	display: block;
	line-height: 2.85rem;
	text-overflow: ellipsis;
	overflow: hidden;
	white-space: nowrap;
	color: var(--navFg);
	min-width: 200px;
}

.itemIcon {
	position: relative;
	width: 32px;
	margin-right: 8px;
}

.itemText {
	position: relative;
	font-size: 0.9em;
}

.itemRemove {
	position: absolute;
	z-index: 10000;
	width: 32px;
	height: 32px;
	color: #ff2a2a;
	right: 8px;
	opacity: 0.8;
}

.itemHandle {
	cursor: move;
	width: 32px;
	height: 32px;
	margin: 0 8px;
	opacity: 0.5;
}
</style>
