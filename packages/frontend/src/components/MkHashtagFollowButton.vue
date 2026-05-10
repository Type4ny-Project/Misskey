<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	class="_button"
	:class="[$style.root, { [$style.wait]: wait, [$style.active]: isFollowing, [$style.full]: full, [$style.large]: large }]"
	:disabled="wait"
	@click="onClick"
>
	<template v-if="!wait">
		<template v-if="isFollowing">
			<span v-if="full" :class="$style.text">{{ i18n.ts.youFollowing }}</span><i class="ti ti-minus"></i>
		</template>
		<template v-else>
			<span v-if="full" :class="$style.text">{{ i18n.ts.follow }}</span><i class="ti ti-plus"></i>
		</template>
	</template>
	<template v-else>
		<span v-if="full" :class="$style.text">{{ i18n.ts.processing }}</span><MkLoading :em="true" :colored="false"/>
	</template>
</button>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { followedHashtagsCache } from '@/cache.js';
import { haptic } from '@/utility/haptic.js';

const props = withDefaults(defineProps<{
	tag: string;
	isFollowing?: boolean;
	full?: boolean;
	large?: boolean;
}>(), {
	isFollowing: false,
	full: false,
	large: false,
});

const emit = defineEmits<{
	(_: 'update:isFollowing', value: boolean): void;
}>();

const isFollowing = ref(props.isFollowing);
const wait = ref(false);

watch(() => props.isFollowing, value => {
	isFollowing.value = value;
});

async function onClick() {
	if (wait.value) return;
	wait.value = true;

	try {
		if (isFollowing.value) {
			await misskeyApi('hashtags/unfollow', { tag: props.tag });
			isFollowing.value = false;
			haptic('light');
		} else {
			await misskeyApi('hashtags/follow', { tag: props.tag });
			isFollowing.value = true;
			haptic('medium');
		}

		followedHashtagsCache.delete();
		emit('update:isFollowing', isFollowing.value);
	} finally {
		wait.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: inline-block;
	font-weight: bold;
	color: var(--MI_THEME-fgOnWhite);
	border: solid 1px var(--MI_THEME-accent);
	padding: 0;
	height: 31px;
	font-size: 16px;
	border-radius: 32px;
	background: #fff;

	&.full {
		padding: 0 8px 0 12px;
		font-size: 14px;
	}

	&.large {
		font-size: 16px;
		height: 38px;
		padding: 0 12px 0 16px;
	}

	&:not(.full) {
		width: 31px;
	}

	&:focus-visible {
		outline-offset: 2px;
	}

	&.active {
		color: var(--MI_THEME-fgOnAccent);
		background: var(--MI_THEME-accent);

		&:hover {
			background: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
			border-color: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
		}

		&:active {
			background: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
			border-color: hsl(from var(--MI_THEME-accent) h s calc(l - 10));
		}
	}

	&.wait {
		cursor: wait !important;
		opacity: 0.7;
	}
}

.text {
	margin-right: 6px;
}
</style>
