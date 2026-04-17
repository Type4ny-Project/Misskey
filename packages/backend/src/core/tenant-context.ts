/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AsyncLocalStorage } from 'node:async_hooks';

type TenantExecutionContext = {
	host: string;
};

const storage = new AsyncLocalStorage<TenantExecutionContext>();

export function runWithTenantHost<T>(host: string, fn: () => T): T {
	return storage.run({ host }, fn);
}

export function getTenantHost(): string | undefined {
	return storage.getStore()?.host;
}
