<!--
SPDX-FileCopyrightText: Type4ny-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/inbox-moderation" :label="i18n.ts.inboxRule" :keywords="['inbox', 'rule', 'moderation', 'federation']" icon="ti ti-mail-shield">
			<div class="_gaps_m">
				<div v-for="(rule, i) in rules" :key="rule.id ?? rule.localId">
					<MkFolder>
						<template #label>{{ rule.name || i18n.ts._inboxRule.unnamedRule }}</template>
						<div class="_gaps_m">
							<MkInput v-model="rule.name">
								<template #label>{{ i18n.ts._inboxRule.name }}</template>
							</MkInput>

							<MkInput v-model="rule.description">
								<template #label>{{ i18n.ts._inboxRule.description }}</template>
							</MkInput>

							<InboxModerationEditorFormula v-model="rule.condFormula"/>

							<MkSelect v-model="rule.action.type" :items="actionItems">
								<template #label>{{ i18n.ts._inboxRule.action }}</template>
								<template #caption>{{ i18n.ts._inboxRule.then }}</template>
							</MkSelect>

							<div class="_buttons">
								<MkButton rounded danger @click="remove(i)">{{ i18n.ts.remove }}</MkButton>
								<MkButton rounded primary @click="save(i)">{{ i18n.ts.save }}</MkButton>
							</div>
						</div>
					</MkFolder>
				</div>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">

import * as Misskey from 'misskey-js';
import { computed, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import { i18n } from '@/i18n.js';
import InboxModerationEditorFormula from '@/pages/admin/InboxModerationEditorFormula.vue';
import * as os from '@/os.js';
import { definePage } from '@/page.js';
import { genId } from '@/utility/id.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type ApiRule = Misskey.entities.AdminInboxRuleListResponse[number];
type RuleFormula = {
	id: string;
	type: string;
	value?: RuleFormula | string | number | boolean | null;
	values?: RuleFormula[];
	sec?: number | null;
} & Record<string, unknown>;
type RuleAction = {
	type: 'reject';
	rewrite?: string | null;
};

type Rule = {
	id?: string;
	localId: string;
	name: string | null;
	condFormula: RuleFormula;
	description: string | null;
	action: RuleAction;
};

const rules = ref<Rule[]>([]);
const actionItems = computed<MkSelectItem<'reject'>[]>(() => [{ value: 'reject', label: i18n.ts._inboxRule.reject }]);

function normalizeFormula(formula: Record<string, unknown>): RuleFormula {
	const normalized: RuleFormula = {
		...formula,
		id: typeof formula.id === 'string' ? formula.id : genId(),
		type: typeof formula.type === 'string' ? formula.type : 'isLocked',
	};

	if (Array.isArray(formula.values)) {
		normalized.values = formula.values.map((value) => normalizeFormula(value as Record<string, unknown>));
	}

	if (typeof formula.value === 'object' && formula.value != null) {
		normalized.value = normalizeFormula(formula.value as Record<string, unknown>);
	}

	return normalized;
}

function normalizeRule(rule: ApiRule): Rule {
	return {
		id: typeof rule.id === 'string' ? rule.id : undefined,
		localId: rule.id ?? genId(),
		name: typeof rule.name === 'string' ? rule.name : null,
		condFormula: normalizeFormula((rule.condFormula ?? {}) as Record<string, unknown>),
		action: rule.action as RuleAction,
		description: typeof rule.description === 'string' ? rule.description : null,
	};
}

async function fetchRules() {
	const res = await misskeyApi('admin/inbox-rule/list');
	rules.value = res.map((rule) => normalizeRule(rule as ApiRule));
}

await fetchRules();

function addRule() {
	rules.value.push({
		id: undefined,
		localId: genId(),
		name: null,
		condFormula: { id: genId(), type: 'isLocked' },
		action: { type: 'reject' },
		description: null,
	});
}

async function save(index:number) {
	const rule = rules.value[index];

	if (rule.id) {
		await misskeyApi('admin/inbox-rule/edit', {
			id: rule.id,
			name: rule.name ?? null,
			condFormula: rule.condFormula,
			action: rule.action,
			description: rule.description ?? '',
		} as unknown as Misskey.entities.AdminInboxRuleEditRequest);
	} else {
		await misskeyApi('admin/inbox-rule/set', {
			name: rule.name,
			condFormula: rule.condFormula,
			action: rule.action,
			description: rule.description ?? '',
		} as unknown as Misskey.entities.AdminInboxRuleSetRequest);
	}

	os.success();
	await fetchRules();
}

async function remove(index:number) {
	const rule = rules.value[index];

	if (rule.id == null) {
		rules.value.splice(index, 1);
		return;
	}

	await misskeyApi('admin/inbox-rule/delete', { id: rule.id });
	rules.value.splice(index, 1);
	os.success();
}

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts._inboxRule.add,
	handler: addRule,
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.inboxRule,
	icon: 'ti ti-mail-shield',
}));

</script>

<style module lang="scss">

</style>
