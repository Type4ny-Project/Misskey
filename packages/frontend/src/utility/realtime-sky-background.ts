/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import tinycolor from 'tinycolor2';
import { realtimeSky } from 'horizon-sky';
import { lang } from '@@/js/config.js';

const UPDATE_INTERVAL_MS = 60_000;
const SIDEBAR_ALPHA = 0.4;

type Coordinates = {
	latitude: number;
	longitude: number;
};

const DEFAULT_COORDINATES: Coordinates = {
	latitude: 35.6764,
	longitude: 139.65,
};

const LANGUAGE_COORDINATES: Record<string, Coordinates> = {
	ja: { latitude: 35.6764, longitude: 139.65 },
};

declare global {
	interface Window {
		__miRealtimeSkyAbortController?: AbortController;
	}
}

function applySkyBackground(topColor: string, bottomColor: string): void {
	const solidGradient = `linear-gradient(180deg, ${topColor} 0%, ${bottomColor} 100%)`;
	const topSidebarColor = tinycolor(topColor).setAlpha(SIDEBAR_ALPHA).toRgbString();
	const bottomSidebarColor = tinycolor(bottomColor).setAlpha(SIDEBAR_ALPHA).toRgbString();
	const sidebarGradient = `linear-gradient(180deg, ${topSidebarColor} 0%, ${bottomSidebarColor} 100%), color(from var(--MI_THEME-navBg) srgb r g b / 0.8)`;
	window.document.documentElement.style.setProperty('--MI-realtimeSkyBackground', solidGradient);
	window.document.documentElement.style.setProperty('--MI-realtimeSkyNavBg', sidebarGradient);
	window.document.documentElement.style.setProperty('--MI-realtimeSkySidebarBg', sidebarGradient);
	window.document.documentElement.style.setProperty('--MI-realtimeSkyPanelBg', solidGradient);
}

function clearSkyBackground(): void {
	window.document.documentElement.style.removeProperty('--MI-realtimeSkyBackground');
	window.document.documentElement.style.removeProperty('--MI-realtimeSkyNavBg');
	window.document.documentElement.style.removeProperty('--MI-realtimeSkySidebarBg');
	window.document.documentElement.style.removeProperty('--MI-realtimeSkyPanelBg');
}

function getFallbackCoordinates(): Coordinates {
	const locale = lang.toLowerCase();
	const languageBase = locale.split('-')[0];
	const languageCoordinates = LANGUAGE_COORDINATES[languageBase];
	if (languageCoordinates != null) {
		return languageCoordinates;
	}

	return DEFAULT_COORDINATES;
}

export async function startRealtimeSkyBackground(): Promise<void> {
	const coordinates = getFallbackCoordinates();

	if (window.__miRealtimeSkyAbortController != null) {
		window.__miRealtimeSkyAbortController.abort();
	}

	const controller = new AbortController();
	window.__miRealtimeSkyAbortController = controller;
	window.addEventListener('beforeunload', () => controller.abort(), { once: true });

	try {
		for await (const sky of realtimeSky({
			latitude: coordinates.latitude,
			longitude: coordinates.longitude,
			interval: UPDATE_INTERVAL_MS,
			signal: controller.signal,
		})) {
			applySkyBackground(sky.topColor, sky.bottomColor);
		}
	} catch (error) {
		console.warn('Failed to update realtime sky background:', error);
	}
}

export function stopRealtimeSkyBackground(): void {
	if (window.__miRealtimeSkyAbortController != null) {
		window.__miRealtimeSkyAbortController.abort();
		window.__miRealtimeSkyAbortController = undefined;
	}
	clearSkyBackground();
}
