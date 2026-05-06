<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/external-services" :label="i18n.ts.externalServices" :keywords="['external', 'services', 'thirdparty']" icon="ti ti-link">
			<div class="_gaps_m">
				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Google Analytics</SearchLabel><span class="_beta">{{ i18n.ts.beta }}</span></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="googleAnalyticsMeasurementId">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Measurement ID</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<MkButton primary @click="save_googleAnalytics">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>DeepL Translation</SearchLabel></template>

						<div class="_gaps_m">
							<SearchMarker>
								<MkInput v-model="deeplAuthKey">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Auth Key</SearchLabel></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkSwitch v-model="deeplIsPro">
									<template #label><SearchLabel>Pro account</SearchLabel></template>
								</MkSwitch>
							</SearchMarker>

							<MkButton primary @click="save_deepl">Save</MkButton>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #label><SearchLabel>Emoji suggestions</SearchLabel></template>
						<template v-if="emojiSuggestionForm.savedState.emojiSuggestionEnabled" #suffix>Enabled</template>
						<template v-else #suffix>Disabled</template>
						<template v-if="emojiSuggestionForm.modified.value" #footer>
							<MkFormFooter :form="emojiSuggestionForm"/>
						</template>

						<div class="_gaps_m">
							<MkInfo>Suggestions are enforced for public, non-local-only notes only. The Worker API key is write-only and is never exposed in public meta.</MkInfo>

							<SearchMarker>
								<MkSwitch v-model="emojiSuggestionForm.state.emojiSuggestionEnabled">
									<template #label><SearchLabel>{{ i18n.ts.enable }}</SearchLabel><span v-if="emojiSuggestionForm.modifiedStates.emojiSuggestionEnabled" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #caption>When disabled, downstream suggestion flow can return an empty fallback without calling the Worker.</template>
								</MkSwitch>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emojiSuggestionForm.state.emojiSuggestionEndpoint">
									<template #prefix><i class="ti ti-link"></i></template>
									<template #label><SearchLabel>Worker endpoint</SearchLabel><span v-if="emojiSuggestionForm.modifiedStates.emojiSuggestionEndpoint" class="_modified">{{ i18n.ts.modified }}</span></template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emojiSuggestionForm.state.emojiSuggestionApiKey" type="password">
									<template #prefix><i class="ti ti-key"></i></template>
									<template #label><SearchLabel>Worker API key / HMAC secret</SearchLabel><span v-if="emojiSuggestionForm.modifiedStates.emojiSuggestionApiKey" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #caption>Leave unchanged to keep the stored secret; clear this field to remove it.</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emojiSuggestionForm.state.emojiSuggestionTimeoutMs" type="number" :min="1">
									<template #label><SearchLabel>Timeout</SearchLabel><span v-if="emojiSuggestionForm.modifiedStates.emojiSuggestionTimeoutMs" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #suffix>ms</template>
								</MkInput>
							</SearchMarker>

							<SearchMarker>
								<MkInput v-model="emojiSuggestionForm.state.emojiSuggestionMaxSuggestions" type="number" :min="1" :max="16">
									<template #label><SearchLabel>Max suggestions</SearchLabel><span v-if="emojiSuggestionForm.modifiedStates.emojiSuggestionMaxSuggestions" class="_modified">{{ i18n.ts.modified }}</span></template>
								</MkInput>
							</SearchMarker>

						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type * as Misskey from 'misskey-js';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import { useForm } from '@/composables/use-form.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';

type EmojiSuggestionAdminMeta = {
	deeplAuthKey: string | null;
	deeplIsPro: boolean;
	googleAnalyticsMeasurementId: string | null;
	emojiSuggestionEnabled: boolean;
	emojiSuggestionEndpoint: string | null;
	emojiSuggestionApiKey: string | null;
	emojiSuggestionTimeoutMs: number;
	emojiSuggestionMaxSuggestions: number;
};

type EmojiSuggestionUpdateMetaRequest = Misskey.entities.AdminUpdateMetaRequest & {
	emojiSuggestionEnabled: boolean;
	emojiSuggestionEndpoint: string;
	emojiSuggestionApiKey: string;
	emojiSuggestionTimeoutMs: number;
	emojiSuggestionMaxSuggestions: number;
};

const meta = await misskeyApi('admin/meta') as Awaited<ReturnType<typeof misskeyApi>> & EmojiSuggestionAdminMeta;

const deeplAuthKey = ref(meta.deeplAuthKey ?? '');
const deeplIsPro = ref(meta.deeplIsPro);
const googleAnalyticsMeasurementId = ref(meta.googleAnalyticsMeasurementId ?? '');

const emojiSuggestionForm = useForm({
	emojiSuggestionEnabled: meta.emojiSuggestionEnabled,
	emojiSuggestionEndpoint: meta.emojiSuggestionEndpoint ?? '',
	emojiSuggestionApiKey: meta.emojiSuggestionApiKey ?? '',
	emojiSuggestionTimeoutMs: meta.emojiSuggestionTimeoutMs,
	emojiSuggestionMaxSuggestions: meta.emojiSuggestionMaxSuggestions,
}, async (state) => {
	const params = {
		emojiSuggestionEnabled: state.emojiSuggestionEnabled,
		emojiSuggestionEndpoint: state.emojiSuggestionEndpoint,
		emojiSuggestionApiKey: state.emojiSuggestionApiKey,
		emojiSuggestionTimeoutMs: Number(state.emojiSuggestionTimeoutMs),
		emojiSuggestionMaxSuggestions: Number(state.emojiSuggestionMaxSuggestions),
	} satisfies EmojiSuggestionUpdateMetaRequest;

	await os.apiWithDialog('admin/update-meta', params);
	fetchInstance(true);
});

function save_deepl() {
	os.apiWithDialog('admin/update-meta', {
		deeplAuthKey: deeplAuthKey.value,
		deeplIsPro: deeplIsPro.value,
	}).then(() => {
		fetchInstance(true);
	});
}

function save_googleAnalytics() {
	os.apiWithDialog('admin/update-meta', {
		googleAnalyticsMeasurementId: googleAnalyticsMeasurementId.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.externalServices,
	icon: 'ti ti-link',
}));
</script>
