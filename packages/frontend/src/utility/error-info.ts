/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { version } from '@@/js/config.js';

export function formatErrorInfo(context: { title?: string; text?: string; error?: unknown; endpoint?: string }): string {
	const error = context.error;
	const details: Record<string, unknown> = {};
	if (typeof error === 'object' && error != null) {
		const fields = error as Record<string, unknown>;
		// Copy diagnostic fields only, never request bodies or credentials attached to errors.
		for (const key of ['name', 'message', 'stack', 'code', 'id', 'endpoint'] as const) {
			if (typeof fields[key] === 'string') details[key] = fields[key];
		}
		if ('info' in error && typeof error.info === 'object' && error.info != null && 'e' in error.info) {
			const serverError = error.info.e;
			if (typeof serverError === 'object' && serverError != null) {
				const serverFields = serverError as Record<string, unknown>;
				const serverDetails: Record<string, string> = {};
				for (const key of ['message', 'code', 'id'] as const) {
					if (typeof serverFields[key] === 'string') serverDetails[key] = serverFields[key];
				}
				details.serverError = serverDetails;
			}
		}
	} else if (typeof error === 'string') {
		details.message = error;
	}
	return JSON.stringify({
		date: new Date().toISOString(),
		version,
		userAgent: navigator.userAgent,
		endpoint: context.endpoint,
		title: context.title,
		text: context.text,
		error: details,
	}, null, 2);
}
