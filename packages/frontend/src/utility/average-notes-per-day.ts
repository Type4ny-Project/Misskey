/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function getAverageNotesPerDay(notesCount: number, createdAt: string, now = Date.now()): number | null {
	const created = Date.parse(createdAt);
	if (!Number.isFinite(created) || !Number.isFinite(now) || created > now || !Number.isFinite(notesCount) || notesCount < 0) return null;

	const days = Math.max(1, Math.ceil((now - created) / 86400000));
	const average = notesCount / days;
	// Large finite counters already have less precision than one decimal place.
	return average > Number.MAX_VALUE / 10 ? average : Math.round(average * 10) / 10;
}
