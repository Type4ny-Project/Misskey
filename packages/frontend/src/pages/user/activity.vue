<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 700px;">
	<div class="_gaps">
		<MkFoldableSection v-if="$i && $i.id === user.id" class="item">
			<template #header><i class="ti ti-chart-bar"></i> Weekly Stats</template>
			<MkLazy>
				<XWeeklyStats/>
			</MkLazy>
		</MkFoldableSection>
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-activity"></i> Heatmap</template>
			<MkHeatmap :user="user" :src="'notes'"/>
		</MkFoldableSection>
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-pencil"></i> Notes</template>
			<XNotes :user="user"/>
		</MkFoldableSection>
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-users"></i> Following</template>
			<XFollowing :user="user"/>
		</MkFoldableSection>
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-eye"></i> PV</template>
			<XPv :user="user"/>
		</MkFoldableSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import XPv from './activity.pv.vue';
import XNotes from './activity.notes.vue';
import XFollowing from './activity.following.vue';
import XWeeklyStats from './activity.weekly-stats.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkHeatmap from '@/components/MkHeatmap.vue';
import { $i } from '@/i.js';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

</script>
