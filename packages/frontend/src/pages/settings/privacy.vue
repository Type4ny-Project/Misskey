<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/privacy" :label="i18n.ts.privacy" :keywords="['privacy']" icon="ti ti-lock-open">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/fluent-emoji/1f513.png" color="#aeff00">
			<SearchText>{{ i18n.ts._settings.privacyBanner }}</SearchText>
		</MkFeatureBanner>

		<FormSection first>
			<template #label><SearchLabel>{{ i18n.ts._followApproval.groupTitle }}</SearchLabel></template>
			<div class="_gaps_m">
				<SearchMarker :keywords="['follow', 'lock']">
					<MkSwitch v-model="isLocked" @update:modelValue="save()">
						<template #label><SearchLabel>{{ i18n.ts.makeFollowManuallyApprove }}</SearchLabel></template>
						<template #caption><SearchText>{{ i18n.ts.lockedAccountInfo }}</SearchText></template>
					</MkSwitch>
				</SearchMarker>

				<SearchMarker
					:keywords="[
						'follow', 'request', 'approval', 'age',
						i18n.ts._followApproval.local,
						i18n.ts._followApproval.localDescription,
						i18n.ts._followApproval.remote,
						i18n.ts._followApproval.remoteDescription,
					]"
				>
					<FormSlot>
						<template #label><SearchLabel>{{ i18n.ts._followApproval.title }}</SearchLabel></template>
						<div class="_gaps_m">
							<div><SearchText>{{ i18n.ts._followApproval.description }}</SearchText></div>
							<MkInfo v-if="isLocked"><SearchText>{{ i18n.ts._followApproval.inactiveDescription }}</SearchText></MkInfo>
							<MkDisableSection :disabled="isLocked">
								<div class="_gaps_m">
									<div v-for="setting in followApprovalSettings" :key="setting.key" class="_gaps_s">
										<MkSelect v-model="setting.mode" :items="followApprovalModes" @update:modelValue="saveFollowApproval(setting)">
											<template #label>{{ setting.label }}</template>
											<template #caption>{{ setting.caption }}</template>
										</MkSelect>
										<MkInput v-if="setting.mode === 'custom'" v-model="setting.amount" type="number" :min="1 / FOLLOW_APPROVAL_UNIT_SECONDS[setting.unit]" :max="FOLLOW_APPROVAL_MAX_SECONDS / FOLLOW_APPROVAL_UNIT_SECONDS[setting.unit]" step="any" @update:modelValue="scheduleFollowApprovalSave(setting)">
											<template #label>{{ i18n.ts._followApproval.period }}</template>
											<template #suffix>{{ setting.unit === 'day' ? i18n.ts._time.day : i18n.ts._time.hour }}</template>
											<template v-if="followApprovalPeriodToSeconds(setting.amount, setting.unit) == null" #caption>{{ i18n.ts._followApproval.invalidPeriod }}</template>
										</MkInput>
										<MkSelect v-if="setting.mode === 'custom'" v-model="setting.unit" :items="followApprovalUnits" @update:modelValue="saveFollowApproval(setting)">
											<template #label>{{ i18n.ts._followApproval.unit }}</template>
										</MkSelect>
									</div>
								</div>
							</MkDisableSection>
						</div>
					</FormSlot>
				</SearchMarker>

				<SearchMarker :keywords="['follow', 'auto', 'accept']">
					<MkSwitch v-model="autoAcceptFollowed" @update:modelValue="save()">
						<template #label><SearchLabel>{{ i18n.ts.autoAcceptFollowed }}</SearchLabel></template>
						<template #caption><SearchText>{{ i18n.ts._followApproval.autoAcceptDescription }}</SearchText></template>
					</MkSwitch>
				</SearchMarker>
			</div>
		</FormSection>

		<SearchMarker :keywords="['reaction', 'public']">
			<MkSwitch v-model="publicReactions" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.makeReactionsPublic }}</SearchLabel></template>
				<template #caption><SearchText>{{ i18n.ts.makeReactionsPublicDescription }}</SearchText></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['following', 'visibility']">
			<MkSelect v-model="followingVisibility" :items="followingVisibilityDef" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.followingVisibility }}</SearchLabel></template>
			</MkSelect>
		</SearchMarker>

		<SearchMarker :keywords="['follower', 'visibility']">
			<MkSelect v-model="followersVisibility" :items="followersVisibilityDef" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.followersVisibility }}</SearchLabel></template>
			</MkSelect>
		</SearchMarker>

		<SearchMarker :keywords="['point', 'visibility']">
			<MkSelect v-model="pointsVisibility" :items="pointsVisibilityDef" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.visibility }} ({{ i18n.ts.point }})</SearchLabel></template>
			</MkSelect>
		</SearchMarker>

		<SearchMarker :keywords="['online', 'status']">
			<MkSwitch v-model="hideOnlineStatus" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.hideOnlineStatus }}</SearchLabel></template>
				<template #caption><SearchText>{{ i18n.ts.hideOnlineStatusDescription }}</SearchText></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['crawle', 'index', 'search']">
			<MkSwitch v-model="noCrawle" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.noCrawle }}</SearchLabel></template>
				<template #caption><SearchText>{{ i18n.ts.noCrawleDescription }}</SearchText></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['crawle', 'ai']">
			<MkSwitch v-model="preventAiLearning" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.preventAiLearning }}</SearchLabel></template>
				<template #caption><SearchText>{{ i18n.ts.preventAiLearningDescription }}</SearchText></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['explore']">
			<MkSwitch v-model="isExplorable" @update:modelValue="save()">
				<template #label><SearchLabel>{{ i18n.ts.makeExplorable }}</SearchLabel></template>
				<template #caption><SearchText>{{ i18n.ts.makeExplorableDescription }}</SearchText></template>
			</MkSwitch>
		</SearchMarker>

		<SearchMarker :keywords="['chat']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.directMessage }}</SearchLabel></template>

				<div class="_gaps_m">
					<MkInfo v-if="$i.policies.chatAvailability === 'unavailable'">{{ i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
					<SearchMarker :keywords="['chat']">
						<MkSelect v-model="chatScope" :items="chatScopeDef" @update:modelValue="save()">
							<template #label><SearchLabel>{{ i18n.ts._chat.chatAllowedUsers }}</SearchLabel></template>
							<template #caption>{{ i18n.ts._chat.chatAllowedUsers_note }}</template>
						</MkSelect>
					</SearchMarker>
				</div>
			</FormSection>
		</SearchMarker>

		<SearchMarker :keywords="['lockdown']">
			<FormSection>
				<template #label><SearchLabel>{{ i18n.ts.lockdown }}</SearchLabel></template>

				<div class="_gaps_m">
					<MkInfo>{{ i18n.ts._accountSettings.lockdownDisableOnly }}</MkInfo>
					<SearchMarker :keywords="['login', 'signin']">
						<MkSwitch :modelValue="requireSigninToViewContents" :disabled="!requireSigninToViewContents" @update:modelValue="disableRequireSignin">
							<template #label><SearchLabel>{{ i18n.ts._accountSettings.requireSigninToViewContents }}</SearchLabel></template>
							<template #caption>
								<div>{{ i18n.ts._accountSettings.requireSigninToViewContentsDescription1 }}</div>
							</template>
						</MkSwitch>
					</SearchMarker>
					<SearchMarker :keywords="['follower']">
						<MkSwitch :modelValue="makeNotesFollowersOnlyBefore != null" :disabled="makeNotesFollowersOnlyBefore == null" @update:modelValue="disableNotesFollowersOnly">
							<template #label><SearchLabel>{{ i18n.ts._accountSettings.makeNotesFollowersOnlyBefore }}</SearchLabel></template>
						</MkSwitch>
					</SearchMarker>
					<SearchMarker :keywords="['hidden']">
						<MkSwitch :modelValue="makeNotesHiddenBefore != null" :disabled="makeNotesHiddenBefore == null" @update:modelValue="disableNotesHidden">
							<template #label><SearchLabel>{{ i18n.ts._accountSettings.makeNotesHiddenBefore }}</SearchLabel></template>
						</MkSwitch>
					</SearchMarker>
				</div>
			</FormSection>
		</SearchMarker>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import type { FollowApprovalPeriodUnit } from '@/utility/follow-approval.js';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import FormSection from '@/components/form/section.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { definePage } from '@/page.js';
import { useMkSelect } from '@/composables/use-mkselect.js';
import FormSlot from '@/components/form/slot.vue';
import MkInput from '@/components/MkInput.vue';
import MkDisableSection from '@/components/MkDisableSection.vue';
import { FOLLOW_APPROVAL_MAX_SECONDS, FOLLOW_APPROVAL_UNIT_SECONDS, followApprovalPeriodFromSeconds, followApprovalPeriodToSeconds } from '@/utility/follow-approval.js';
import * as os from '@/os.js';
import MkInfo from '@/components/MkInfo.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';

const $i = ensureSignin();

const isLocked = ref($i.isLocked);
const autoAcceptFollowed = ref($i.autoAcceptFollowed);

type FollowApprovalSetting = {
	key: 'followApprovalLocalSeconds' | 'followApprovalRemoteSeconds';
	mode: 'default' | 'disabled' | 'custom';
	amount: number | null;
	unit: FollowApprovalPeriodUnit;
	label: string;
	caption: string;
};

const followApprovalSettings = ref<FollowApprovalSetting[]>([
	{
		key: 'followApprovalLocalSeconds',
		mode: $i.followApprovalLocalSeconds == null ? 'default' : $i.followApprovalLocalSeconds === 0 ? 'disabled' : 'custom',
		...followApprovalPeriodFromSeconds($i.followApprovalLocalSeconds || 7 * 86400),
		label: i18n.ts._followApproval.local,
		caption: i18n.ts._followApproval.localDescription,
	},
	{
		key: 'followApprovalRemoteSeconds',
		mode: $i.followApprovalRemoteSeconds == null ? 'default' : $i.followApprovalRemoteSeconds === 0 ? 'disabled' : 'custom',
		...followApprovalPeriodFromSeconds($i.followApprovalRemoteSeconds || 7 * 86400),
		label: i18n.ts._followApproval.remote,
		caption: i18n.ts._followApproval.remoteDescription,
	},
]);

const followApprovalModes = [
	{ label: i18n.ts._followApproval.useDefault, value: 'default' },
	{ label: i18n.ts.disabled, value: 'disabled' },
	{ label: i18n.ts._followApproval.custom, value: 'custom' },
];

const followApprovalUnits = [
	{ label: i18n.ts._time.hour, value: 'hour' },
	{ label: i18n.ts._time.day, value: 'day' },
];

const followApprovalSaveTimers = new Map<FollowApprovalSetting['key'], number>();

function scheduleFollowApprovalSave(setting: FollowApprovalSetting) {
	window.clearTimeout(followApprovalSaveTimers.get(setting.key));
	followApprovalSaveTimers.set(setting.key, window.setTimeout(() => saveFollowApproval(setting), 1000));
}

onBeforeUnmount(() => {
	for (const setting of followApprovalSettings.value) {
		if (followApprovalSaveTimers.has(setting.key)) saveFollowApproval(setting);
	}
});

function saveFollowApproval(setting: FollowApprovalSetting) {
	window.clearTimeout(followApprovalSaveTimers.get(setting.key));
	followApprovalSaveTimers.delete(setting.key);
	const seconds = followApprovalPeriodToSeconds(setting.amount, setting.unit);
	if (setting.mode === 'custom' && seconds == null) {
		return;
	}
	misskeyApi('i/update', {
		[setting.key]: setting.mode === 'default' ? null : setting.mode === 'disabled' ? 0 : seconds,
	}).catch(err => {
		os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: err.code === 'RATE_LIMIT_EXCEEDED' ? i18n.ts.cannotPerformTemporaryDescription : err.message,
		});
	});
}

const noCrawle = ref($i.noCrawle);
const preventAiLearning = ref($i.preventAiLearning);
const isExplorable = ref($i.isExplorable);
const requireSigninToViewContents = ref($i.requireSigninToViewContents ?? false);
const makeNotesFollowersOnlyBefore = ref($i.makeNotesFollowersOnlyBefore ?? null);
const makeNotesHiddenBefore = ref($i.makeNotesHiddenBefore ?? null);
const hideOnlineStatus = ref($i.hideOnlineStatus);
const publicReactions = ref($i.publicReactions);
const {
	model: followingVisibility,
	def: followingVisibilityDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.public, value: 'public' },
		{ label: i18n.ts.followers, value: 'followers' },
		{ label: i18n.ts.private, value: 'private' },
	],
	initialValue: $i.followingVisibility,
});
const {
	model: followersVisibility,
	def: followersVisibilityDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.public, value: 'public' },
		{ label: i18n.ts.followers, value: 'followers' },
		{ label: i18n.ts.private, value: 'private' },
	],
	initialValue: $i.followersVisibility,
});
const {
	model: chatScope,
	def: chatScopeDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts._chat._chatAllowedUsers.everyone, value: 'everyone' },
		{ label: i18n.ts._chat._chatAllowedUsers.followers, value: 'followers' },
		{ label: i18n.ts._chat._chatAllowedUsers.following, value: 'following' },
		{ label: i18n.ts._chat._chatAllowedUsers.mutual, value: 'mutual' },
		{ label: i18n.ts._chat._chatAllowedUsers.none, value: 'none' },
	],
	initialValue: $i.chatScope,
});
const {
	model: pointsVisibility,
	def: pointsVisibilityDef,
} = useMkSelect({
	items: [
		{ label: i18n.ts.public, value: 'public' },
		{ label: i18n.ts.followers, value: 'followers' },
		{ label: i18n.ts.private, value: 'private' },
	],
	initialValue: $i.pointsVisibility,
});

async function disableRequireSignin(value: boolean) {
	if (value) return;
	await os.apiWithDialog('i/update', { requireSigninToViewContents: false });
	requireSigninToViewContents.value = false;
}

async function disableNotesFollowersOnly(value: boolean) {
	if (value) return;
	await os.apiWithDialog('i/update', { makeNotesFollowersOnlyBefore: null });
	makeNotesFollowersOnlyBefore.value = null;
}

async function disableNotesHidden(value: boolean) {
	if (value) return;
	await os.apiWithDialog('i/update', { makeNotesHiddenBefore: null });
	makeNotesHiddenBefore.value = null;
}

function save() {
	misskeyApi('i/update', {
		isLocked: !!isLocked.value,
		autoAcceptFollowed: !!autoAcceptFollowed.value,
		noCrawle: !!noCrawle.value,
		preventAiLearning: !!preventAiLearning.value,
		isExplorable: !!isExplorable.value,
		hideOnlineStatus: !!hideOnlineStatus.value,
		publicReactions: !!publicReactions.value,
		followingVisibility: followingVisibility.value,
		followersVisibility: followersVisibility.value,
		pointsVisibility: pointsVisibility.value,
		chatScope: chatScope.value,
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.privacy,
	icon: 'ti ti-lock-open',
}));
</script>
