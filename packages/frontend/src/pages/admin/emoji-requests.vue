<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<MkLoading v-if="loading"/>

			<div v-else-if="requests.length === 0">
				<div class="_fullInfo">
					<span>{{ i18n.ts.emojiRequestNoRequests }}</span>
				</div>
			</div>

			<div v-else class="requests">
				<div
					v-for="request in requests"
					:key="request.id"
					class="request _panel"
				>
					<div class="header">
						<img :src="request.originalUrl" class="emoji" :alt="':' + request.name + ':'"/>
						<div class="info">
							<div class="name">:{{ request.name }}:</div>
							<div class="meta">
								<span v-if="request.category" class="category">{{ request.category }}</span>
								<span class="status" :class="request.status">{{ statusLabel(request.status) }}</span>
							</div>
						</div>
						<div class="actions">
							<MkButton v-if="request.status === 'pending'" primary rounded @click="approve(request)">
								<i class="ti ti-check"></i> {{ i18n.ts.approve }}
							</MkButton>
							<MkButton v-if="request.status === 'pending'" danger rounded @click="reject(request)">
								<i class="ti ti-x"></i> {{ i18n.ts.reject }}
							</MkButton>
						</div>
					</div>

					<div v-if="request.aliases.length > 0" class="aliases">
						<span v-for="alias in request.aliases" :key="alias" class="alias">:{{ alias }}:</span>
					</div>

					<div class="details _gaps_s">
						<div v-if="request.license" class="detail">
							<span class="label">{{ i18n.ts.emojiRequestLicense }}:</span>
							<span class="value">{{ request.license }}</span>
						</div>
						<div v-if="request.comment" class="detail">
							<span class="label">{{ i18n.ts.emojiRequestComment }}:</span>
							<span class="value">{{ request.comment }}</span>
						</div>
						<div class="detail">
							<span class="label">{{ i18n.ts.registeredAt }}:</span>
							<span class="value">{{ new Date(request.createdAt).toLocaleString() }}</span>
						</div>
						<div v-if="request.userId" class="detail">
							<span class="label">User ID:</span>
							<MkUserLink :userId="request.userId" class="value"/>
						</div>
					</div>

					<div v-if="request.rejectionReason" class="rejectionReason">
						<div class="label">{{ i18n.ts.emojiRequestRejectReason }}:</div>
						<div class="reason">{{ request.rejectionReason }}</div>
					</div>
				</div>
			</div>

			<MkButton v-if="hasMore" @click="fetchMore()">
				<i class="ti ti-reload"></i>{{ i18n.ts.more }}
			</MkButton>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkUserLink from '@/components/MkUserLink.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';

interface EmojiRequest {
	id: string;
	createdAt: string;
	updatedAt: string | null;
	userId: string | null;
	name: string;
	category: string | null;
	originalUrl: string;
	aliases: string[];
	license: string | null;
	comment: string;
	status: 'pending' | 'approved' | 'rejected';
	rejectionReason: string | null;
}

const requests = ref<EmojiRequest[]>([]);
const tab = ref<'all' | 'pending' | 'approved' | 'rejected'>('all');
const loading = ref(true);
const hasMore = ref(false);
const untilId = ref<string | null>(null);

function statusLabel(status: EmojiRequest['status']): string {
	switch (status) {
		case 'pending':
			return i18n.ts.emojiRequestStatusPending;
		case 'approved':
			return i18n.ts.emojiRequestStatusApproved;
		case 'rejected':
			return i18n.ts.emojiRequestStatusRejected;
		default:
			return status;
	}
}

async function fetchRequests(limit = 50, append = false) {
	loading.value = true;

	try {
		const result = await misskeyApi('admin/emoji/list-request', {
			limit,
			status: tab.value === 'all' ? undefined : tab.value,
			untilId: untilId.value ?? undefined,
		});

		if (append) {
			requests.value = [...requests.value, ...result];
		} else {
			requests.value = result;
		}

		hasMore.value = result.length === limit;
		if (result.length > 0) {
			untilId.value = result[result.length - 1].id;
		} else {
			untilId.value = null;
		}
	} catch (err) {
		console.error(err);
		os.alert({
			type: 'error',
			text: err.message,
		});
	} finally {
		loading.value = false;
	}
}

async function fetchMore() {
	if (!hasMore.value || loading.value) return;
	await fetchRequests(50, true);
}

async function approve(request: EmojiRequest) {
	const { canceled } = await os.confirm({
		type: 'info',
		text: i18n.tsx.approveConfirm({ x: ':' + request.name + ':' }),
	});
	if (canceled) return;

	try {
		await os.apiWithDialog('admin/emoji/approve-request', {
			requestId: request.id,
		});

		os.alert({
			type: 'success',
			text: i18n.ts.emojiRequestApproved,
		});

		await fetchRequests();
	} catch (err) {
		console.error(err);
	}
}

async function reject(request: EmojiRequest) {
	const { canceled, result: reason } = await os.inputText({
		type: 'text',
		title: i18n.ts.emojiRequestRejectReason,
		placeholder: i18n.ts.pleaseEnterToContinue,
	});
	if (canceled) return;

	const { canceled: confirmCanceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.rejectConfirm({ x: ':' + request.name + ':', reason }),
	});
	if (confirmCanceled) return;

	try {
		await os.apiWithDialog('admin/emoji/reject-request', {
			requestId: request.id,
			reason: reason,
		});

		os.alert({
			type: 'success',
			text: i18n.ts.emojiRequestRejected,
		});

		await fetchRequests();
	} catch (err) {
		console.error(err);
	}
}

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'all',
	title: i18n.ts.all,
}, {
	key: 'pending',
	title: i18n.ts.emojiRequestStatusPending,
}, {
	key: 'approved',
	title: i18n.ts.emojiRequestStatusApproved,
}, {
	key: 'rejected',
	title: i18n.ts.emojiRequestStatusRejected,
}]);

watch(tab, () => {
	untilId.value = null;
	requests.value = [];
	fetchRequests();
});

onMounted(() => {
	fetchRequests();
});

definePage(() => ({
	title: i18n.ts.emojiRequest,
	icon: 'ti ti-star',
}));
</script>

<style lang="scss" scoped>
.requests {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.request {
	padding: 16px;

	.header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;

		.emoji {
			width: 48px;
			height: 48px;
			object-fit: contain;
		}

		.info {
			flex: 1;

			.name {
				font-weight: bold;
				font-size: 1.1em;
			}

			.meta {
				display: flex;
				gap: 8px;
				margin-top: 4px;
				font-size: 0.85em;
				opacity: 0.7;

				.status {
					&.pending {
						color: var(--MI_THEME-warn);
					}
					&.approved {
						color: var(--MI_THEME-success);
					}
					&.rejected {
						color: var(--MI_THEME-error);
					}
				}
			}
		}

		.actions {
			display: flex;
			gap: 8px;
		}
	}

	.aliases {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 12px;

		.alias {
			font-size: 0.85em;
			opacity: 0.7;
		}
	}

	.details {
		padding: 12px;
		background: var(--MI_THEME-bg);
		border-radius: 4px;
		margin-bottom: 12px;

		.detail {
			display: flex;
			gap: 8px;
			font-size: 0.9em;

			.label {
				opacity: 0.7;
				white-space: nowrap;
			}

			.value {
				word-break: break-word;
			}
		}
	}

	.rejectionReason {
		padding: 8px;
		background: var(--MI_THEME-errorBg);
		border-radius: 4px;

		.label {
			font-size: 0.85em;
			opacity: 0.8;
			margin-bottom: 4px;
		}

		.reason {
			font-size: 0.9em;
		}
	}
}
</style>
