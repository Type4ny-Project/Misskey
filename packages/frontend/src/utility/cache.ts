/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import { get as idbGet, set as idbSet, del as idbDel } from '@/utility/idb-proxy.js';

type PersistOptions<T> = {
	/**
	 * 保存先のキーを返します。nullを返す間は保存も復元もしません。
	 * アカウントごとに内容を分けたいときは、キーにアカウントIDを含めてください。
	 */
	key: () => string | null;
	/** 保存されていた内容が期待する形か確かめます。違えば捨てて、fetcherを呼びます。 */
	validate: (value: unknown) => value is T;
};

type PersistedEntry<T> = {
	cachedAt: number;
	value: T;
};

export class Cache<T> {
	private cachedAt: number | null = null;
	public value = ref<T | undefined>();
	private lifetime: number;
	private fetcher: () => Promise<T>;
	private persistOptions: PersistOptions<T> | null;
	// set/deleteのたびに進める。保存内容の復元を待っている間に更新や破棄があったとき、古い内容で上書きしないために使う
	private revision = 0;

	constructor(lifetime: Cache<never>['lifetime'], fetcher: () => Promise<T>, persist?: PersistOptions<T>) {
		this.lifetime = lifetime;
		this.fetcher = fetcher;
		this.persistOptions = persist ?? null;
	}

	public set(value: T): void {
		this.revision++;
		this.cachedAt = Date.now();
		this.value.value = value;

		const key = this.persistOptions?.key();
		if (key != null) {
			const entry: PersistedEntry<T> = { cachedAt: this.cachedAt, value };
			// 保存領域が使えなくても、メモリ上のキャッシュだけで動き続ける
			idbSet(key, entry).catch(() => {});
		}
	}

	private get(): T | undefined {
		if (this.cachedAt == null) return undefined;
		if ((Date.now() - this.cachedAt) > this.lifetime) {
			this.value.value = undefined;
			this.cachedAt = null;
			return undefined;
		}
		return this.value.value;
	}

	public delete() {
		this.revision++;
		this.cachedAt = null;

		const key = this.persistOptions?.key();
		if (key != null) {
			idbDel(key).catch(() => {});
		}
	}

	/**
	 * 保存されている内容が有効期間内ならメモリに戻して返します。
	 * 無い・期限切れ・壊れている・保存領域が使えないときはundefinedを返します。
	 */
	private async restore(): Promise<T | undefined> {
		const persist = this.persistOptions;
		const key = persist?.key();
		if (persist == null || key == null) return undefined;

		const revision = this.revision;
		try {
			const saved: unknown = await idbGet(key);
			// 待っている間に別の取得・更新・破棄があった場合は、保存内容を使わない
			if (revision !== this.revision) return this.get();

			if (saved == null || typeof saved !== 'object') return undefined;
			const { cachedAt, value } = saved as Partial<PersistedEntry<unknown>>;
			if (typeof cachedAt !== 'number' || !Number.isFinite(cachedAt) || !persist.validate(value)) {
				idbDel(key).catch(() => {});
				return undefined;
			}

			const age = Date.now() - cachedAt;
			if (age < 0 || age > this.lifetime) {
				idbDel(key).catch(() => {});
				return undefined;
			}

			// 有効期間は、保存した時刻から数える(読み込み直すたびに延びない)
			this.cachedAt = cachedAt;
			this.value.value = value;
			return value;
		} catch {
			return undefined;
		}
	}

	/**
	 * キャッシュがあればそれを返し、無ければfetcherを呼び出して結果をキャッシュ&返します
	 */
	public async fetch(): Promise<T> {
		const cachedValue = this.get();
		if (cachedValue !== undefined) {
			// Cache HIT
			return cachedValue;
		}

		if (this.persistOptions != null) {
			const restoredValue = await this.restore();
			if (restoredValue !== undefined) {
				// Cache HIT (保存領域から復元)
				return restoredValue;
			}
		}

		// Cache MISS
		const value = await this.fetcher();
		this.set(value);
		return value;
	}
}
