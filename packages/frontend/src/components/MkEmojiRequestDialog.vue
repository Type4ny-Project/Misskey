<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow
	ref="windowEl"
	:initialWidth="600"
	:initialHeight="600"
	:canResize="true"
	@close="windowEl?.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.emojiRequestCreate }}</template>

	<div style="display: flex; flex-direction: column; min-height: 100%;">
		<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px; flex-grow: 1;">
			<div class="_gaps_m">
				<MkInfo>{{ i18n.ts.emojiRequestCreateDescription }}</MkInfo>

				<div v-if="previewUrl != null" :class="$style.previews">
					<div :class="$style.previewCell" style="background: #000;">
						<img :src="previewUrl" :class="$style.previewImg"/>
					</div>
					<div :class="$style.previewCell" style="background: #222;">
						<img :src="previewUrl" :class="$style.previewImg"/>
					</div>
					<div :class="$style.previewCell" style="background: #ddd;">
						<img :src="previewUrl" :class="$style.previewImg"/>
					</div>
					<div :class="$style.previewCell" style="background: #fff;">
						<img :src="previewUrl" :class="$style.previewImg"/>
					</div>
				</div>

				<MkButton rounded style="margin: 0 auto;" @click="selectImage">{{ i18n.ts.selectFile }}</MkButton>

				<MkInput v-model="name" pattern="[a-z0-9_-]" autocapitalize="off">
					<template #label>{{ i18n.ts.emojiRequestName }}</template>
					<template #caption>{{ i18n.ts.emojiRequestNamePlaceholder }}</template>
				</MkInput>

				<MkInput v-model="category" :datalist="categories">
					<template #label>{{ i18n.ts.emojiRequestCategory }}</template>
					<template #caption>{{ i18n.ts.emojiRequestCategoryPlaceholder }}</template>
				</MkInput>

				<MkInput v-model="originalUrl" type="url">
					<template #label>{{ i18n.ts.emojiRequestUrl }}</template>
					<template #caption>{{ i18n.ts.emojiRequestUrlPlaceholder }}</template>
				</MkInput>

				<MkInput v-model="aliases" autocapitalize="off">
					<template #label>{{ i18n.ts.emojiRequestAliases }}</template>
					<template #caption>
						{{ i18n.ts.emojiRequestAliasesPlaceholder }}<br/>
						{{ i18n.ts.setMultipleBySeparatingWithSpace }}
					</template>
				</MkInput>

				<MkInput v-model="license">
					<template #label>{{ i18n.ts.emojiRequestLicense }}</template>
					<template #caption>{{ i18n.ts.emojiRequestLicensePlaceholder }}</template>
				</MkInput>

				<MkTextarea v-model="comment" :maxlength="2048">
					<template #label>{{ i18n.ts.emojiRequestComment }}</template>
					<template #caption>{{ i18n.ts.emojiRequestCommentPlaceholder }}</template>
				</MkTextarea>
			</div>
		</div>
		<div :class="$style.footer">
			<div :class="$style.footerButtons">
				<MkButton primary rounded style="margin: 0 auto;" :disabled="submitting || !canSubmit" @click="submit">
					<i v-if="submitting" class="ti ti-loader ti-fw" :class="$style.spinner"></i>
					{{ i18n.ts.submit }}
				</MkButton>
			</div>
		</div>
	</div>
</MkWindow>
</template>

<script lang="ts" setup>
import { computed, ref, watch, useTemplateRef } from 'vue';
import MkWindow from '@/components/MkWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { customEmojiCategories } from '@/custom-emojis.js';
import { selectFile } from '@/utility/drive.js';

const emit = defineEmits<{
	(ev: 'done', v: { created: { id: string; createdAt: string; status: string } }): void,
	(ev: 'closed'): void
}>();

const windowEl = useTemplateRef('windowEl');
const name = ref('');
const category = ref('');
const originalUrl = ref('');
const aliases = ref('');
const license = ref('');
const comment = ref('');
const submitting = ref(false);
const previewUrl = ref<string | null>(null);

const categories = computed(() => customEmojiCategories.value.filter((x): x is string => x != null));

const canSubmit = computed(() => {
	if (name.value === '' || originalUrl.value === '') return false;
	const namePattern = /^[a-z0-9_-]+$/;
	if (!namePattern.test(name.value)) return false;
	const urlPattern = /^https?:\/\/.+/;
	if (!urlPattern.test(originalUrl.value)) return false;
	return true;
});

watch(originalUrl, (newUrl) => {
	if (newUrl && newUrl.match(/^https?:\/\/.+/)) {
		previewUrl.value = newUrl;
	} else {
		previewUrl.value = null;
	}
});

async function selectImage(ev: MouseEvent) {
	const file = await selectFile({
		anchorElement: ev.currentTarget ?? ev.target,
		multiple: false,
	});
	originalUrl.value = file.url;

	if (name.value === '') {
		const candidate = file.name.replace(/\.(.+)$/, '');
		if (candidate.match(/^[a-z0-9_-]+$/)) {
			name.value = candidate;
		}
	}
}

async function submit() {
	if (submitting.value) return;

	if (name.value === '' || originalUrl.value === '') {
		os.alert({
			type: 'error',
			text: i18n.ts.fillIsRequired,
		});
		return;
	}

	const namePattern = /^[a-z0-9_-]+$/;
	if (!namePattern.test(name.value)) {
		os.alert({
			type: 'error',
			text: i18n.ts.emojiRequestNamePlaceholder,
		});
		return;
	}

	const urlPattern = /^https?:\/\/.+/;
	if (!urlPattern.test(originalUrl.value)) {
		os.alert({
			type: 'error',
			text: i18n.ts.emojiRequestUrlPlaceholder,
		});
		return;
	}

	submitting.value = true;

	try {
		const result = await os.apiWithDialog('emoji-request/create', {
			name: name.value,
			category: category.value === '' ? null : category.value,
			originalUrl: originalUrl.value,
			aliases: aliases.value.replaceAll('　', ' ').split(' ').filter(x => x !== ''),
			license: license.value === '' ? null : license.value,
			comment: comment.value === '' ? '' : comment.value,
		});

		os.alert({
			type: 'success',
			text: i18n.ts.emojiRequestCreated,
		});

		emit('done', {
			created: result,
		});

		windowEl.value?.close();
	} catch (err) {
		console.error(err);
	} finally {
		submitting.value = false;
	}
}
</script>

<style lang="scss" module>
.previews {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	justify-content: center;

	.previewCell {
		padding: 8px;
		border-radius: 6px;
	}

	background: var(--MI_THEME-panel);
	padding: 12px;
	border-radius: 8px;
}

.previewImg {
	max-width: 100px;
	max-height: 100px;
	object-fit: contain;
}

.spinner {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

.footer {
	position: sticky;
	z-index: 10000;
	bottom: 0;
	left: 0;
	padding: 12px;
	border-top: solid 0.5px var(--MI_THEME-divider);
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
}

.footerButtons {
	display: flex;
	gap: 8px;
	justify-content: center;
}
</style>
