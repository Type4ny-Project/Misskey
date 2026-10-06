<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="560" :height="580" @close="close" @esc="close" @closed="emit('closed')">
	<template #header><i class="ti ti-network" aria-hidden="true"></i> {{ i18n.ts._calls.connectionInfo }}</template>
	<div :class="$style.body">
		<p v-if="failed">{{ i18n.ts._calls.connectionInfoUnavailable }}</p>
		<section>
			<dl :class="$style.rows">
				<dt>{{ i18n.ts._calls.connectionStatus }}</dt><dd>{{ status }}</dd>
				<dt>{{ i18n.ts._calls.callServer }}</dt><dd>{{ i18n.ts._calls.cloudflareSfu }}</dd>
			</dl>
		</section>
		<section>
			<h3>{{ i18n.ts._calls.turnServer }}</h3>
			<p v-if="!info?.turnServers.length">—</p>
			<dl v-for="server in info?.turnServers" :key="server.host" :class="$style.rows">
				<dt>{{ i18n.ts._calls.turnHost }}</dt><dd>{{ server.host }}</dd>
				<dt>{{ i18n.ts._calls.udpPort }}</dt><dd>{{ server.udp.join(' · ') || '—' }}</dd>
				<dt>{{ i18n.ts._calls.tcpPort }}</dt><dd>{{ server.tcp.join(' · ') || '—' }}</dd>
				<dt>{{ i18n.ts._calls.tlsPort }}</dt><dd>{{ server.tls.join(' · ') || '—' }}</dd>
			</dl>
		</section>
		<section>
			<h3>{{ i18n.ts._calls.sendingMedia }}</h3>
			<dl :class="$style.rows">
				<dt>{{ i18n.ts._calls.connectionRoute }}</dt><dd>{{ route }}</dd>
				<dt>{{ i18n.ts._calls.packetLoss }}</dt><dd>{{ percent(info?.sendLoss) }}</dd>
				<dt>{{ i18n.ts._calls.roundTripTime }}</dt><dd>{{ info?.roundTripTime == null ? '—' : `${Math.round(info.roundTripTime * 1000)} ms` }}</dd>
			</dl>
		</section>
		<section>
			<h3>{{ i18n.ts._calls.receivingMedia }}</h3>
			<dl :class="$style.rows">
				<dt>{{ i18n.ts._calls.packetLoss }}</dt><dd>{{ percent(info?.receiveLoss) }}</dd>
			</dl>
		</section>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import type { CallsConnectionInfo } from '@/utility/calls-connection-info.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ getInfo: () => Promise<CallsConnectionInfo | null> }>();
const emit = defineEmits<{ (ev: 'closed'): void }>();
const dialog = shallowRef<InstanceType<typeof MkModalWindow>>();
const info = shallowRef<CallsConnectionInfo | null>(null);
const failed = ref(false);
let stopped = false;
let timer: number | undefined;
const status = computed(() => {
	if (info.value == null) return '—';
	if (info.value.state === 'connected') return i18n.ts._calls.connected;
	if (info.value.state === 'connecting' || info.value.state === 'new') return i18n.ts._calls.connecting;
	if (info.value.state === 'failed') return i18n.ts._calls.mediaFailed;
	return i18n.ts._calls.disconnected;
});
const route = computed(() => info.value?.relay == null ? '—' : `${info.value.relay ? i18n.ts._calls.relayRoute : i18n.ts._calls.directRoute}${info.value.protocol == null ? '' : ` · ${info.value.protocol.toUpperCase()}`}`);

function percent(value: number | null | undefined): string { return value == null ? '—' : `${value.toFixed(1)}%`; }

async function refresh(): Promise<void> {
	try {
		const result = await props.getInfo();
		if (stopped) return;
		info.value = result;
		failed.value = false;
	} catch {
		if (stopped) return;
		info.value = null;
		failed.value = true;
	}
	if (!stopped) timer = window.setTimeout(refresh, 2000);
}

function stop(): void { stopped = true; window.clearTimeout(timer); }

function close(): void { stop(); dialog.value?.close(); }

onMounted(refresh);
onUnmounted(stop);
</script>

<style lang="scss" module>
.body { padding: 20px; display: flex; flex-direction: column; gap: 24px; }
.body h3 { margin: 0 0 16px; font-size: 0.9em; font-weight: normal; opacity: 0.7; }
.rows { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 14px 16px; align-items: baseline; }
.rows + .rows { margin-top: 20px; }
.rows dt { opacity: 0.7; }
.rows dd { margin: 0; text-align: right; font-weight: 600; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
</style>
