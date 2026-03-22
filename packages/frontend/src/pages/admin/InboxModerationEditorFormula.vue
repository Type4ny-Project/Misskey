<!--
SPDX-FileCopyrightText: Type4ny-project
SPDX-License-Identifier: AGPL-3.0-only
-->
<template>
<div class="_gaps">
	<div :class="$style.header">
		<MkSelect v-model="type" :items="conditionTypeItems" :class="$style.typeSelect" />
		<button v-if="draggable" class="drag-handle _button" :class="$style.dragHandle">
			<i class="ti ti-menu-2"></i>
		</button>
		<button v-if="draggable" class="_button" :class="$style.remove" @click="removeSelf">
			<i class="ti ti-x"></i>
		</button>
	</div>

	<div v-if="type === 'and' || type === 'or' || type === 'thisActivityIsNote'" class="_gaps">
		<MkDraggable v-model="nestedValues" direction="vertical" group="inboxRuleFormula" withGaps>
			<template #default="{ item }">
				<div :class="$style.item">
					<InboxModerationEditorFormula :modelValue="item" :isNote="type === 'thisActivityIsNote'" draggable @update:modelValue="updated => valuesItemUpdated(updated)" @remove="removeItem(item)"/>
				</div>
			</template>
		</MkDraggable>
		<MkButton rounded style="margin: 0 auto;" @click="addValue"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
	</div>

	<div v-else-if="type === 'not'" :class="$style.item">
		<InboxModerationEditorFormula v-model="nestedValue"/>
	</div>

	<MkInput v-else-if="type === 'createdLessThan' || type === 'createdMoreThan'" v-model="secValue" type="number">
		<template #suffix>sec</template>
	</MkInput>

	<MkInput
		v-else-if="[
			'followersLessThanOrEq',
			'followersMoreThanOrEq',
			'followingLessThanOrEq',
			'followingMoreThanOrEq',
			'notesLessThanOrEq',
			'notesMoreThanOrEq',
			'serverPubLessThanOrEq',
			'serverPubMoreThanOrEq',
			'serverSubLessThanOrEq',
			'serverSubMoreThanOrEq',
			'maxMentionsMoreThanOrEq',
			'attachmentFileMoreThanOrEq',
		].includes(type)" v-model="numericValue" type="number"
	>
	</MkInput>

	<MkInput
		v-else-if="[
			'serverHost',
			'serverSoftware',
			'isIncludeThisWord',
		].includes(type)" v-model="textValue"
	>
	</MkInput>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import MkDraggable from '@/components/MkDraggable.vue';
import { i18n } from '@/i18n.js';
import { deepClone } from '@/utility/clone.js';
import { genId } from '@/utility/id.js';

type FormulaType =
	| 'and'
	| 'or'
	| 'not'
	| 'thisActivityIsNote'
	| 'isLocked'
	| 'isBot'
	| 'isCat'
	| 'createdLessThan'
	| 'createdMoreThan'
	| 'followersLessThanOrEq'
	| 'followersMoreThanOrEq'
	| 'followingLessThanOrEq'
	| 'followingMoreThanOrEq'
	| 'notesLessThanOrEq'
	| 'notesMoreThanOrEq'
	| 'maxMentionsMoreThanOrEq'
	| 'attachmentFileMoreThanOrEq'
	| 'isIncludeThisWord'
	| 'serverHost'
	| 'serverSoftware'
	| 'serverIsSilenced'
	| 'serverPubLessThanOrEq'
	| 'serverPubMoreThanOrEq'
	| 'serverSubLessThanOrEq'
	| 'serverSubMoreThanOrEq'
	| 'roleAssignedTo'
	| 'isRemote';

type FormulaNode = {
	id: string;
	type: string;
	value?: FormulaNode | string | number | boolean | null;
	values?: FormulaNode[];
	sec?: number | null;
	roleId?: string;
} & Record<string, unknown>;

function normalizeType(value: string | undefined): FormulaType {
	switch (value) {
		case 'and':
		case 'or':
		case 'not':
		case 'thisActivityIsNote':
		case 'isLocked':
		case 'isBot':
		case 'isCat':
		case 'createdLessThan':
		case 'createdMoreThan':
		case 'followersLessThanOrEq':
		case 'followersMoreThanOrEq':
		case 'followingLessThanOrEq':
		case 'followingMoreThanOrEq':
		case 'notesLessThanOrEq':
		case 'notesMoreThanOrEq':
		case 'maxMentionsMoreThanOrEq':
		case 'attachmentFileMoreThanOrEq':
		case 'isIncludeThisWord':
		case 'serverHost':
		case 'serverSoftware':
		case 'serverIsSilenced':
		case 'serverPubLessThanOrEq':
		case 'serverPubMoreThanOrEq':
		case 'serverSubLessThanOrEq':
		case 'serverSubMoreThanOrEq':
		case 'roleAssignedTo':
		case 'isRemote':
			return value;
		default:
			return 'isLocked';
	}
}

function normalizeNode(value: FormulaNode): FormulaNode {
	const next: FormulaNode = {
		...value,
		id: value.id ?? genId(),
		type: value.type ?? 'isLocked',
	};

	if (Array.isArray(value.values)) {
		next.values = value.values.map((item) => normalizeNode(item));
	}

	if (typeof value.value === 'object' && value.value != null) {
		next.value = normalizeNode(value.value as FormulaNode);
	}

	return next;
}

const emit = defineEmits<{
	(ev: 'update:modelValue', value: FormulaNode): void;
	(ev: 'remove'): void;
}>();

const props = defineProps<{
	modelValue: FormulaNode;
	draggable?: boolean;
	isNote?: boolean;
}>();

const v = ref(normalizeNode(deepClone(props.modelValue)));

const nestedValues = computed<FormulaNode[]>({
	get: () => v.value.values ?? [],
	set: (values) => {
		v.value.values = values;
	},
});

const nestedValue = computed<FormulaNode>({
	get: () => {
		if (typeof v.value.value === 'object' && v.value.value != null) {
			return normalizeNode(v.value.value as FormulaNode);
		}

		return { id: genId(), type: 'isRemote' };
	},
	set: (value: FormulaNode) => {
		v.value.value = value;
	},
});

const secValue = computed<number | null>({
	get: () => v.value.sec ?? null,
	set: (value) => {
		v.value.sec = value;
	},
});

const numericValue = computed<number | null>({
	get: () => typeof v.value.value === 'number' ? v.value.value : null,
	set: (value) => {
		v.value.value = value;
	},
});

const textValue = computed<string | null>({
	get: () => typeof v.value.value === 'string' ? v.value.value : null,
	set: (value) => {
		v.value.value = value;
	},
});

const conditionTypeItems = computed<MkSelectItem<FormulaType>[]>(() => [{
	type: 'group',
	label: i18n.ts.accounts,
	items: [{ value: 'isLocked', label: i18n.ts._role._condition.isLocked }, {
		value: 'isBot',
		label: i18n.ts._role._condition.isBot,
	}, {
		value: 'isCat',
		label: i18n.ts._role._condition.isCat,
	}, {
		value: 'createdLessThan',
		label: i18n.ts._role._condition.createdLessThan,
	}, {
		value: 'createdMoreThan',
		label: i18n.ts._role._condition.createdMoreThan,
	}, {
		value: 'followersLessThanOrEq',
		label: i18n.ts._role._condition.followersLessThanOrEq,
	}, {
		value: 'followersMoreThanOrEq',
		label: i18n.ts._role._condition.followersMoreThanOrEq,
	}, {
		value: 'followingLessThanOrEq',
		label: i18n.ts._role._condition.followingLessThanOrEq,
	}, {
		value: 'followingMoreThanOrEq',
		label: i18n.ts._role._condition.followingMoreThanOrEq,
	}, {
		value: 'notesLessThanOrEq',
		label: i18n.ts._role._condition.notesLessThanOrEq,
	}, {
		value: 'notesMoreThanOrEq',
		label: i18n.ts._role._condition.notesMoreThanOrEq,
	}],
}, {
	type: 'group',
	label: i18n.ts._inboxRule.notes,
	items: [{ value: 'maxMentionsMoreThanOrEq', label: i18n.ts._inboxRule.maxMentionsMoreThanOrEq }, {
		value: 'attachmentFileMoreThanOrEq',
		label: i18n.ts._inboxRule.attachmentFileMoreThanOrEq,
	}, {
		value: 'isIncludeThisWord',
		label: i18n.ts._inboxRule.isIncludeThisWord,
	}],
}, {
	type: 'group',
	label: 'Servers',
	items: [{ value: 'serverHost', label: i18n.ts._inboxRule.serverHost }, {
		value: 'serverSoftware',
		label: i18n.ts._inboxRule.serverSoftware,
	}, {
		value: 'serverIsSilenced',
		label: i18n.ts._inboxRule.serverIsSilenced,
	}, {
		value: 'serverPubLessThanOrEq',
		label: i18n.ts._inboxRule.serverPubLessThanOrEq,
	}, {
		value: 'serverPubMoreThanOrEq',
		label: i18n.ts._inboxRule.serverPubMoreThanOrEq,
	}, {
		value: 'serverSubLessThanOrEq',
		label: i18n.ts._inboxRule.serverSubLessThanOrEq,
	}, {
		value: 'serverSubMoreThanOrEq',
		label: i18n.ts._inboxRule.serverSubMoreThanOrEq,
	}],
}, {
	type: 'group',
	label: i18n.ts._inboxRule.conditions,
	items: [
		...(!props.isNote ? [{ value: 'thisActivityIsNote' as const, label: i18n.ts._inboxRule.thisActivityIsNote }] : []),
		{ value: 'and', label: i18n.ts._inboxRule.and },
		{ value: 'or', label: i18n.ts._inboxRule.or },
		{ value: 'not', label: i18n.ts._inboxRule.not },
	],
}]);

watch(() => props.modelValue, () => {
	if (JSON.stringify(props.modelValue) === JSON.stringify(v.value)) return;
	v.value = normalizeNode(deepClone(props.modelValue));
}, { deep: true });

watch(v, () => {
	emit('update:modelValue', v.value);
}, { deep: true });

const type = computed({
	get: () => normalizeType(v.value.type),
	set: (t) => {
		if (t === 'and') v.value.values = [];
		if (t === 'or') v.value.values = [];
		if (t === 'thisActivityIsNote') v.value.values = [];
		if (t === 'not') v.value.value = { id: genId(), type: 'isRemote' };
		if (t === 'roleAssignedTo') v.value.roleId = '';
		if (t === 'createdLessThan') v.value.sec = 86400;
		if (t === 'createdMoreThan') v.value.sec = 86400;
		if (t === 'followersLessThanOrEq') v.value.value = 10;
		if (t === 'followersMoreThanOrEq') v.value.value = 10;
		if (t === 'followingLessThanOrEq') v.value.value = 10;
		if (t === 'followingMoreThanOrEq') v.value.value = 10;
		if (t === 'maxMentionsMoreThanOrEq') v.value.value = 5;
		if (t === 'attachmentFileMoreThanOrEq') v.value.value = 16;
		if (t === 'notesLessThanOrEq') v.value.value = 10;
		if (t === 'notesMoreThanOrEq') v.value.value = 10;
		if (t === 'serverPubLessThanOrEq') v.value.value = 5;
		if (t === 'serverPubMoreThanOrEq') v.value.value = 5;
		if (t === 'serverSubLessThanOrEq') v.value.value = 5;
		if (t === 'serverSubMoreThanOrEq') v.value.value = 5;
		if (t === 'serverHost') v.value.value = '';
		if (t === 'serverSoftware') v.value.value = '';
		if (t === 'isIncludeThisWord') v.value.value = '';
		v.value.type = t;
	},
});

function addValue() {
	v.value.values ??= [];
	v.value.values.push({ id: genId(), type: 'isRemote' });
}

function valuesItemUpdated(item: FormulaNode) {
	if (v.value.values == null) return;
	const i = v.value.values.findIndex((_item: FormulaNode) => _item.id === item.id);
	if (i !== -1) {
		v.value.values[i] = item;
	}
}

function removeItem(item: FormulaNode) {
	if (v.value.values == null) return;
	v.value.values = v.value.values.filter((_item: FormulaNode) => _item.id !== item.id);
}

function removeSelf() {
	emit('remove');
}
</script>

<style lang="scss" module>
.header {
	display: flex;
}

.typeSelect {
	flex: 1;
}

.dragHandle {
	cursor: move;
	margin-left: 10px;
}

.remove {
	margin-left: 10px;
}

.item {
	border: solid 2px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	padding: 12px;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}
</style>
