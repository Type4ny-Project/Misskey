/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { onMounted, onUnmounted } from 'vue';
import { useInterval } from '@@/js/use-interval.js';
import { favoritedChannelsCache, userChannelFollowingsCache } from '@/cache.js';
import { $i } from '@/i.js';
import { globalEvents } from '@/events.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { get, set } from '@/utility/idb-proxy.js';
import { genId } from '@/utility/id.js';

const EVENT_NOTIFICATION_STORAGE_KEY = 'event-timing-notifier:notified';
const UPCOMING_EVENTS_WINDOW_MS = 24 * 60 * 60 * 1000;
const FETCH_INTERVAL_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const NOTIFICATION_GRACE_PERIOD_MS = 10 * 60 * 1000;
const NOTIFIED_EVENTS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function useEventTimingNotifier(): void {
	if (!$i) return;

	let upcomingEvents: Misskey.entities.Event[] = [];
	let notifiedEvents: Record<string, number> = {};
	let hasHydratedNotifiedEvents = false;
	let isFetchingUpcomingEvents = false;

	function formatDateTime(date: Date): string {
		const pad = (value: number): string => String(value).padStart(2, '0');
		return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function getEventStartAt(event: Misskey.entities.Event): number {
		return new Date(event.startAt).getTime();
	}

	function getEventNotificationKey(event: Misskey.entities.Event): string {
		return `${event.id}:${getEventStartAt(event)}`;
	}

	function cleanupNotifiedEvents(now: number): void {
		notifiedEvents = Object.fromEntries(
			Object.entries(notifiedEvents).filter(([, notifiedAt]) => now - notifiedAt <= NOTIFIED_EVENTS_RETENTION_MS),
		);
	}

	async function persistNotifiedEvents(): Promise<void> {
		await set(EVENT_NOTIFICATION_STORAGE_KEY, notifiedEvents);
	}

	async function hydrateNotifiedEvents(): Promise<void> {
		if (hasHydratedNotifiedEvents) return;

		const storedValue = await get(EVENT_NOTIFICATION_STORAGE_KEY);
		const now = Date.now();

		if (storedValue != null && typeof storedValue === 'object' && !Array.isArray(storedValue)) {
			const nextNotifiedEvents: Record<string, number> = {};

			for (const [key, value] of Object.entries(storedValue as Record<string, unknown>)) {
				if (typeof value === 'number' && now - value <= NOTIFIED_EVENTS_RETENTION_MS) {
					nextNotifiedEvents[key] = value;
				}
			}

			notifiedEvents = nextNotifiedEvents;
		}

		hasHydratedNotifiedEvents = true;
		await persistNotifiedEvents();
	}

	function buildEventNotification(event: Misskey.entities.Event): Misskey.entities.Notification {
		const lines = [
			event.title,
			`${i18n.ts._events.startAt}: ${formatDateTime(new Date(event.startAt))}`,
			event.channel?.name != null ? `${i18n.ts.channel}: ${event.channel.name}` : null,
		].filter((line): line is string => line != null);

		return {
			id: genId(),
			createdAt: new Date().toUTCString(),
			type: 'app',
			header: i18n.ts._events.eventCalendar,
			body: lines.join('\n'),
			icon: null,
		};
	}

	function notifyInBrowser(event: Misskey.entities.Event): void {
		if (window.document.visibilityState === 'visible') return;
		if (typeof window.Notification === 'undefined') return;
		if (window.Notification.permission !== 'granted') return;

		const notification = new window.Notification(i18n.ts._events.eventCalendar, {
			body: `${event.title}\n${i18n.ts._events.startAt}: ${formatDateTime(new Date(event.startAt))}`,
			tag: `event:${getEventNotificationKey(event)}`,
		});

		notification.onclick = () => {
			void window.focus();
			window.location.assign(`/events/${event.id}`);
			notification.close();
		};
	}

	function emitEventNotification(event: Misskey.entities.Event): void {
		globalEvents.emit('clientNotification', buildEventNotification(event));
		notifyInBrowser(event);
	}

	function isEventWithinUpcomingWindow(event: Misskey.entities.Event, now: number): boolean {
		const startAt = getEventStartAt(event);
		return Number.isFinite(startAt) && startAt >= now - NOTIFICATION_GRACE_PERIOD_MS && startAt <= now + UPCOMING_EVENTS_WINDOW_MS;
	}

	function sortAndFilterUpcomingEvents(events: Misskey.entities.Event[], now: number): Misskey.entities.Event[] {
		return events
			.filter(event => isEventWithinUpcomingWindow(event, now))
			.sort((a, b) => getEventStartAt(a) - getEventStartAt(b));
	}

	function deduplicateEvents(events: Misskey.entities.Event[]): Misskey.entities.Event[] {
		const deduplicatedEvents = new Map<string, Misskey.entities.Event>();

		for (const event of events) {
			deduplicatedEvents.set(getEventNotificationKey(event), event);
		}

		return [...deduplicatedEvents.values()];
	}

	async function fetchEventsForChannelScope(now: number): Promise<Misskey.entities.Event[]> {
		const [followedChannels, favoritedChannels] = await Promise.all([
			userChannelFollowingsCache.fetch(),
			favoritedChannelsCache.fetch(),
		]);

		const channelIds = [...new Set([
			...followedChannels.map(channel => channel.id),
			...favoritedChannels.map(channel => channel.id),
		])];

		const requests = [
			misskeyApi('events/list', {
				limit: 100,
				sinceDate: now - NOTIFICATION_GRACE_PERIOD_MS,
				untilDate: now + UPCOMING_EVENTS_WINDOW_MS,
				includeChannelEvents: false,
				channelId: null,
			} satisfies Misskey.entities.EventsListRequest),
			...channelIds.map(channelId => misskeyApi('events/list', {
				limit: 100,
				sinceDate: now - NOTIFICATION_GRACE_PERIOD_MS,
				untilDate: now + UPCOMING_EVENTS_WINDOW_MS,
				includeChannelEvents: false,
				channelId,
			} satisfies Misskey.entities.EventsListRequest)),
		];

		const eventsByScope = await Promise.all(requests);
		return deduplicateEvents(eventsByScope.flat());
	}

	async function fetchUpcomingEvents(): Promise<void> {
		if (isFetchingUpcomingEvents) return;

		isFetchingUpcomingEvents = true;

		try {
			const now = Date.now();
			const events = await fetchEventsForChannelScope(now);
			upcomingEvents = sortAndFilterUpcomingEvents(events, now);
		} catch (error) {
			console.error('Failed to fetch upcoming events for notifications.', error);
		} finally {
			isFetchingUpcomingEvents = false;
		}
	}

	async function checkDueEvents(): Promise<void> {
		await hydrateNotifiedEvents();

		const now = Date.now();
		const notifiedEventsCountBeforeCleanup = Object.keys(notifiedEvents).length;
		cleanupNotifiedEvents(now);

		let hasChanges = Object.keys(notifiedEvents).length !== notifiedEventsCountBeforeCleanup;

		for (const event of upcomingEvents) {
			const startAt = getEventStartAt(event);
			if (!Number.isFinite(startAt)) continue;
			if (startAt > now || now - startAt > NOTIFICATION_GRACE_PERIOD_MS) continue;

			const notificationKey = getEventNotificationKey(event);
			if (notificationKey in notifiedEvents) continue;

			notifiedEvents[notificationKey] = now;
			hasChanges = true;
			emitEventNotification(event);
		}

		if (hasChanges) {
			await persistNotifiedEvents();
		}
	}

	async function refreshAndCheckEvents(): Promise<void> {
		await fetchUpcomingEvents();
		await checkDueEvents();
	}

	const handleVisibilityChange = () => {
		if (window.document.visibilityState !== 'visible') return;
		void refreshAndCheckEvents();
	};

	onMounted(() => {
		void refreshAndCheckEvents();
		window.document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onUnmounted(() => {
		window.document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	useInterval(() => {
		void fetchUpcomingEvents();
	}, FETCH_INTERVAL_MS, {
		immediate: false,
		afterMounted: true,
	});

	useInterval(() => {
		void checkDueEvents();
	}, CHECK_INTERVAL_MS, {
		immediate: false,
		afterMounted: true,
	});
}
