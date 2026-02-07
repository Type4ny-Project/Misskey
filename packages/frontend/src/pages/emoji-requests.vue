<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div class="_gaps">
			<MkInfo>{{ i18n.ts.emojiRequestCreateDescription }}</MkInfo>

			<div class="_gaps">
				<div v-if="requests.length === 0" class="_panel">
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
						</div>
						<div v-if="request.aliases.length > 0" class="aliases">
							<span v-for="alias in request.aliases" :key="alias" class="alias">:{{ alias }}:</span>
						</div>
						<div v-if="request.comment" class="comment">
							{{ request.comment }}
						</div>
						<div v-if="request.rejectionReason" class="rejectionReason">
							<div class="label">{{ i18n.ts.emojiRequestRejectReason }}:</div>
							<div class="reason">{{ request.rejectionReason }}</div>
						</div>
						<div class="footer">
							<div class="date">{{ new Date(request.createdAt).toLocaleString() }}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';

interface EmojiRequest {
	id: string;
	createdAt: string;
	updatedAt: string | null;
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

async function fetchRequests() {
	try {
		const result = await misskeyApi('emoji-requests', {
			limit: 100,
		});
		requests.value = result;
	} catch (err) {
		console.error(err);
		os.alert({
			type: 'error',
			text: err.message,
		});
	}
}

async function createRequest() {
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkEmojiRequestDialog.vue').then(x => x.default), {
	}, {
		done: result => {
			if (result.created) {
				fetchRequests();
			}
		},
		closed: () => dispose(),
	});
}

const headerActions = computed(() => [{
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.emojiRequestCreate,
	handler: createRequest,
}]);

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
		margin-bottom: 8px;

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
	}

	.aliases {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;

		.alias {
			font-size: 0.85em;
			opacity: 0.7;
		}
	}

	.comment {
		font-size: 0.9em;
		margin-bottom: 8px;
		padding: 8px;
		background: var(--MI_THEME-bg);
		border-radius: 4px;
	}

	.rejectionReason {
		margin-bottom: 8px;
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

	.footer {
		display: flex;
		justify-content: flex-end;
		font-size: 0.8em;
		opacity: 0.6;
	}
}
</style>
