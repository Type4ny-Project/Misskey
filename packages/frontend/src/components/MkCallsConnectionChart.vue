<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section :class="$style.root">
	<h3>{{ i18n.ts._calls.connectionHistory }}</h3>
	<p :class="$style.description">{{ i18n.ts._calls.connectionHistoryDescription }}</p>
	<h4>{{ i18n.ts._calls.roundTripTime }}</h4>
	<div :class="$style.chart"><canvas ref="latencyEl" role="img" :aria-label="i18n.ts._calls.roundTripTime"></canvas></div>
	<h4>{{ i18n.ts._calls.packetLoss }}</h4>
	<div :class="$style.chart"><canvas ref="lossEl" role="img" :aria-label="i18n.ts._calls.packetLoss"></canvas></div>
</section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import { Chart, CategoryScale, LinearScale, LineController, LineElement, PointElement, Legend, Tooltip } from 'chart.js';
import type { CallsConnectionInfo } from '@/utility/calls-connection-info.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{ samples: { at: number; info: CallsConnectionInfo | null }[] }>();
const latencyEl = useTemplateRef('latencyEl');
const lossEl = useTemplateRef('lossEl');
let latencyChart: Chart<'line', (number | null)[], string> | null = null;
let lossChart: Chart<'line', (number | null)[], string> | null = null;

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Legend, Tooltip);

function createChart(canvas: HTMLCanvasElement, labels: string[], unit: string, colors: string[]): Chart<'line', (number | null)[], string> {
	const style = getComputedStyle(canvas);
	const fg = style.getPropertyValue('--MI_THEME-fg').trim();
	const divider = style.getPropertyValue('--MI_THEME-divider').trim();
	return new Chart(canvas, {
		type: 'line',
		data: {
			labels: [],
			datasets: labels.map((label, index) => ({ label, data: [], borderColor: colors[index], backgroundColor: colors[index], borderWidth: 2, borderDash: index === 1 ? [4, 3] : [], pointRadius: 1, pointHoverRadius: 4, spanGaps: false })),
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			animation: false,
			interaction: { mode: 'index', intersect: false },
			scales: {
				x: { ticks: { color: fg, maxTicksLimit: 4, maxRotation: 0 }, grid: { display: false } },
				y: { beginAtZero: true, suggestedMax: unit === '%' ? 1 : 50, ticks: { color: fg, callback: value => `${value}${unit === '%' ? '%' : ' ms'}` }, grid: { color: divider } },
			},
			plugins: {
				legend: { display: labels.length > 1, labels: { color: fg, boxWidth: 12, boxHeight: 2 } },
				title: { display: false },
				tooltip: { callbacks: { label: item => `${item.dataset.label}: ${item.parsed.y == null ? '—' : unit === '%' ? item.parsed.y.toFixed(1) : Math.round(item.parsed.y)}${unit === '%' ? '%' : ' ms'}` } },
			},
		},
	});
}

function updateCharts(): void {
	if (latencyChart == null || lossChart == null) return;
	const labels = props.samples.map(sample => new Date(sample.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
	latencyChart.data.labels = labels;
	latencyChart.data.datasets[0].data = props.samples.map(sample => sample.info?.roundTripTime == null ? null : sample.info.roundTripTime * 1000);
	lossChart.data.labels = labels;
	lossChart.data.datasets[0].data = props.samples.map(sample => sample.info?.sendLoss ?? null);
	lossChart.data.datasets[1].data = props.samples.map(sample => sample.info?.receiveLoss ?? null);
	latencyChart.update('none');
	lossChart.update('none');
}

onMounted(() => {
	if (latencyEl.value == null || lossEl.value == null) return;
	const style = getComputedStyle(latencyEl.value);
	const accent = style.getPropertyValue('--MI_THEME-accent').trim();
	const infoColor = style.getPropertyValue('--MI_THEME-infoFg').trim();
	latencyChart = createChart(latencyEl.value, [i18n.ts._calls.roundTripTime], 'ms', [accent]);
	lossChart = createChart(lossEl.value, [i18n.ts._calls.sending, i18n.ts._calls.receiving], '%', [accent, infoColor]);
	updateCharts();
});
watch(() => props.samples, updateCharts);
onUnmounted(() => { latencyChart?.destroy(); lossChart?.destroy(); });
</script>

<style lang="scss" module>
.root { min-width: 0; }
.description { margin: -4px 0 16px; font-size: 0.85em; line-height: 1.5; opacity: 0.7; }
.chart { position: relative; height: 140px; min-width: 0; }
.root h4 { margin: 16px 0 8px; font-size: 0.85em; font-weight: normal; }
</style>
