/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onUnmounted, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';

export function useCallsScreenZoom(viewport: Ref<HTMLElement | null>, video: Ref<HTMLVideoElement | null>, enabled: Ref<boolean>) {
	const zoom = shallowRef(100);
	const offset = shallowRef({ x: 0, y: 0 });
	const dragging = shallowRef(false);
	let pointer: { id: number; x: number; y: number } | null = null;
	const transform = computed(() => `translate(${offset.value.x}px, ${offset.value.y}px) scale(${zoom.value / 100})`);

	function constrain(): void {
		const element = viewport.value;
		if (element == null) return;
		const width = element.clientWidth;
		const height = element.clientHeight;
		const media = video.value;
		const fit = media != null && media.videoWidth > 0 && media.videoHeight > 0 ? Math.min(width / media.videoWidth, height / media.videoHeight) : 1;
		const maxX = Math.max(0, ((media?.videoWidth ? media.videoWidth * fit : width) * zoom.value / 100 - width) / 2);
		const maxY = Math.max(0, ((media?.videoHeight ? media.videoHeight * fit : height) * zoom.value / 100 - height) / 2);
		offset.value = { x: Math.max(-maxX, Math.min(maxX, offset.value.x)), y: Math.max(-maxY, Math.min(maxY, offset.value.y)) };
	}

	function setZoom(value: number, x = 0, y = 0): void {
		const next = Math.max(100, Math.min(400, Math.round(value)));
		const ratio = next / zoom.value;
		offset.value = { x: x - (x - offset.value.x) * ratio, y: y - (y - offset.value.y) * ratio };
		zoom.value = next;
		constrain();
	}

	function onWheel(event: WheelEvent): void {
		if (!enabled.value || (event.target as HTMLElement).closest('input, label')) return;
		event.preventDefault();
		const rect = viewport.value?.getBoundingClientRect();
		if (rect == null) return;
		const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
		setZoom(zoom.value * Math.exp(-delta * 0.002), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
	}

	function onPointerDown(event: PointerEvent): void {
		if (event.button !== 0 || pointer != null) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
		dragging.value = true;
	}

	function onPointerMove(event: PointerEvent): void {
		if (pointer?.id !== event.pointerId) return;
		offset.value = { x: offset.value.x + event.clientX - pointer.x, y: offset.value.y + event.clientY - pointer.y };
		pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
		constrain();
	}

	function stopDragging(): void {
		pointer = null;
		dragging.value = false;
	}

	function reset(): void {
		zoom.value = 100;
		offset.value = { x: 0, y: 0 };
		stopDragging();
	}

	const observer = new ResizeObserver(constrain);
	watch(viewport, (element, previous) => {
		if (previous != null) observer.unobserve(previous);
		if (element != null) observer.observe(element);
	}, { flush: 'post' });
	watch(enabled, reset);
	onUnmounted(() => observer.disconnect());

	return { zoom, transform, dragging, setZoom, onWheel, onPointerDown, onPointerMove, stopDragging, reset, constrain };
}
