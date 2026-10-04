/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { describe, beforeAll, test, expect, vi } from 'vitest';
// node-fetch only supports it's own Blob yet
// https://github.com/node-fetch/node-fetch/pull/1664
import { Blob } from 'node-fetch';
import { api, castAsError, initTestDb, post, role, signup, simpleGet, uploadFile } from '../utils.js';
import type * as misskey from 'misskey-js';
import { MiUser, MiEmoji, MiAnnouncementReaction } from '@/models/_.js';

const waitForPushToTlOptions = { timeout: 3000, interval: 25 };

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let dave: misskey.entities.SignupResponse;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
		dave = await signup({ username: 'dave' });
		await api('admin/update-meta', { federation: 'all' }, alice as misskey.entities.SignupResponse);
	}, 1000 * 60 * 2);

	describe('Announcement reactions', () => {
		async function createAnnouncement(params: Partial<misskey.entities.AdminAnnouncementsCreateRequest> = {}) {
			const res = await api('admin/announcements/create', {
				title: 'Reaction test', text: 'Announcement', imageUrl: null, reactionsEnabled: true,
				...params,
			}, alice);
			expect(res.status).toBe(200);
			return res.body.id;
		}

		test('追加・変更・取消と再取得の集計が一致し、リアクションで既読にする', async () => {
			const announcementId = await createAnnouncement({ needConfirmationToRead: true });
			for (const [user, reaction] of [[bob, '👍'], [carol, '👍'], [bob, '🎉']] as const) {
				const res = await api('announcements/react', { announcementId, reaction }, user);
				expect(res.status).toBe(200);
				expect(res.body.myReaction).toBe(reaction);
				expect(res.body.isRead).toBe(true);
			}
			const detail = await api('announcements/show', { announcementId }, bob);
			expect(detail.body.reactions).toEqual({ '👍': 1, '🎉': 1 });
			expect(detail.body.myReaction).toBe('🎉');
			const list = await api('announcements', {}, bob);
			expect(list.body.find(a => a.id === announcementId)?.reactions).toEqual(detail.body.reactions);
			const me = await api('i', {}, bob);
			expect(me.body.unreadAnnouncements.some(a => a.id === announcementId)).toBe(false);
			const adminList = await api('admin/announcements/list', {}, alice);
			expect(adminList.body.find(a => a.id === announcementId)?.reactions).toEqual(detail.body.reactions);
			const cancel = await api('announcements/react', { announcementId, reaction: null }, bob);
			expect(cancel.status).toBe(200);
			expect(cancel.body.reactions).toEqual({ '👍': 1 });
			expect(cancel.body.myReaction).toBeNull();
			expect(cancel.body.isRead).toBe(true);
			await api('i/read-announcement', { announcementId }, bob);
			expect((await api('announcements/show', { announcementId }, bob)).body.isRead).toBe(true);
		});

		test.each(['©️', '👁️‍🗨️'])('ピッカーの絵文字 %s を保存し、別ユーザーも同じ反応を追加できる', async reaction => {
			const announcementId = await createAnnouncement();
			const first = await api('announcements/react', { announcementId, reaction }, bob);
			expect(first.status).toBe(200);
			const stored = reaction.includes('\u200d') ? reaction : reaction.replace(/\ufe0f/g, '');
			expect(first.body.myReaction).toBe(stored);
			const second = await api('announcements/react', { announcementId, reaction: first.body.myReaction }, carol);
			expect(second.status).toBe(200);
			expect(second.body.reactions).toEqual({ [stored]: 2 });
			expect(second.body.myReaction).toBe(stored);
		});

		test('既存ユーザー限定では作成後に登録したユーザーの反応を拒否する', async () => {
			const announcementId = await createAnnouncement({ forExistingUsers: true });
			const laterUser = await signup({ username: 'lateruser' });
			expect(laterUser.token).toBeDefined();
			for (const reaction of ['👍', null]) {
				const res = await api('announcements/react', { announcementId, reaction }, laterUser);
				expect(castAsError(res.body).error.code).toBe('NO_SUCH_ANNOUNCEMENT');
			}
			expect((await api('announcements/show', { announcementId }, laterUser)).body)
				.toMatchObject({ isRead: false, myReaction: null, reactions: {} });
			expect((await api('announcements/react', { announcementId, reaction: '👍' }, bob)).status).toBe(200);
			await api('admin/announcements/update', { id: announcementId, forExistingUsers: false }, alice);
			expect((await api('announcements/react', { announcementId, reaction: '👍' }, laterUser)).status).toBe(200);
		});

		test('管理一覧はページ内の各お知らせに既読数とリアクションを集計する', async () => {
			const first = await createAnnouncement();
			const second = await createAnnouncement();
			const empty = await createAnnouncement();
			await api('announcements/react', { announcementId: first, reaction: '👍' }, bob);
			await api('announcements/react', { announcementId: first, reaction: '👍' }, carol);
			await api('announcements/react', { announcementId: second, reaction: '🎉' }, bob);
			const list = await api('admin/announcements/list', { limit: 3 }, alice);
			expect(list.status).toBe(200);
			expect(list.body).toHaveLength(3);
			expect(list.body.find(a => a.id === first)).toMatchObject({ reads: 2, reactions: { '👍': 2 } });
			expect(list.body.find(a => a.id === second)).toMatchObject({ reads: 1, reactions: { '🎉': 1 } });
			expect(list.body.find(a => a.id === empty)).toMatchObject({ reads: 0, reactions: {} });
			expect((await api('admin/announcements/list', { sinceId: empty }, alice)).body).toEqual([]);
		});

		test('管理者は反応者と現在の絵文字をページ分けで取得でき、一般ユーザーには公開しない', async () => {
			const announcementId = await createAnnouncement();
			const otherId = await createAnnouncement();
			await api('announcements/react', { announcementId, reaction: '👍' }, bob);
			await api('announcements/react', { announcementId, reaction: '🎉' }, carol);
			await api('announcements/react', { announcementId, reaction: '❤' }, bob);
			await api('announcements/react', { announcementId: otherId, reaction: '👍' }, dave);
			await api('admin/announcements/update', { id: announcementId, reactionsEnabled: false }, alice);

			const first = await api('admin/announcements/reactions', { announcementId, limit: 1 }, alice);
			expect(first.status).toBe(200);
			expect(first.body).toHaveLength(1);
			const second = await api('admin/announcements/reactions', { announcementId, untilId: first.body[0].id, limit: 1 }, alice);
			expect(second.status).toBe(200);
			expect(second.body).toHaveLength(1);
			expect([...first.body, ...second.body].map(r => ({ userId: r.user.id, reaction: r.reaction })))
				.toEqual(expect.arrayContaining([{ userId: bob.id, reaction: '❤' }, { userId: carol.id, reaction: '🎉' }]));
			expect((await api('admin/announcements/reactions', { announcementId, untilId: second.body[0].id }, alice)).body).toEqual([]);
			for (const user of [bob, undefined]) {
				const res = await api('admin/announcements/reactions', { announcementId }, user);
				expect(res.status).toBe(user ? 403 : 401);
			}
			const missing = await api('admin/announcements/reactions', { announcementId: '0000000000' }, alice);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_ANNOUNCEMENT');
		});

		test('モデレーターは個人向け・アーカイブ済みのお知らせの反応者も確認できる', async () => {
			const moderator = await signup({ username: 'annmoderator' });
			expect(moderator.token).toBeDefined();
			const moderatorRole = await role(alice, { name: 'Announcement moderator', isModerator: true });
			await api('admin/roles/assign', { roleId: moderatorRole.id, userId: moderator.id }, alice);
			const announcementId = await createAnnouncement({ userId: bob.id });
			await api('announcements/react', { announcementId, reaction: '👍' }, bob);
			const res = await api('admin/announcements/reactions', { announcementId }, moderator);
			expect(res.status).toBe(200);
			expect(res.body).toHaveLength(1);
			expect(res.body[0]).toMatchObject({ reaction: '👍', user: { id: bob.id, username: bob.username } });
			await api('announcements/react', { announcementId, reaction: null }, bob);
			expect((await api('admin/announcements/reactions', { announcementId }, moderator)).body).toEqual([]);
		});

		test('未設定は無効で、APIによる追加・取消も拒否する', async () => {
			const announcementId = await createAnnouncement({ reactionsEnabled: undefined });
			for (const reaction of ['👍', null]) {
				const res = await api('announcements/react', { announcementId, reaction }, bob);
				expect(castAsError(res.body).error.code).toBe('REACTIONS_DISABLED');
			}
			expect((await api('announcements/show', { announcementId }, bob)).body.reactionsEnabled).toBe(false);
		});

		test('個人向けはリアクションでアーカイブされ、管理者も集計を閲覧できる', async () => {
			const announcementId = await createAnnouncement({ userId: bob.id, needConfirmationToRead: true });
			expect((await api('announcements/react', { announcementId, reaction: '👍' }, bob)).status).toBe(200);
			for (const user of [carol, undefined]) {
				const detail = await api('announcements/show', { announcementId }, user);
				expect(castAsError(detail.body).error.code).toBe('NO_SUCH_ANNOUNCEMENT');
				const list = await api('announcements', {}, user);
				expect(list.body.some(a => a.id === announcementId)).toBe(false);
			}
			for (const reaction of ['🎉', null]) {
				const res = await api('announcements/react', { announcementId, reaction }, carol);
				expect(castAsError(res.body).error.code).toBe('NO_SUCH_ANNOUNCEMENT');
			}
			expect((await api('announcements/react', { announcementId, reaction: '🎉' })).status).toBe(401);
			expect((await api('announcements', {}, bob)).body.some(a => a.id === announcementId)).toBe(false);
			const adminList = await api('admin/announcements/list', { userId: bob.id, status: 'archived' }, alice);
			expect(adminList.body.find(a => a.id === announcementId)).toMatchObject({ reactions: { '👍': 1 }, reads: 1 });
			expect((await api('admin/announcements/list', { userId: bob.id, status: 'archived' }, carol)).status).toBe(403);
			const archived = await api('announcements', { isActive: false }, bob);
			expect(archived.body.find(a => a.id === announcementId)?.myReaction).toBe('👍');
		});

		test('本文更新・無効化で記録を維持し、お知らせ削除時に記録を削除する', async () => {
			const announcementId = await createAnnouncement();
			await api('announcements/react', { announcementId, reaction: '👍' }, bob);
			await api('admin/announcements/update', { id: announcementId, text: 'Updated', reactionsEnabled: false }, alice);
			expect((await api('announcements/show', { announcementId }, bob)).body.reactions).toEqual({});
			expect((await api('admin/announcements/list', {}, alice)).body.find(a => a.id === announcementId)?.reactions).toEqual({ '👍': 1 });
			expect(castAsError((await api('announcements/react', { announcementId, reaction: '🎉' }, bob)).body).error.code).toBe('REACTIONS_DISABLED');
			await api('admin/announcements/update', { id: announcementId, reactionsEnabled: true }, alice);
			expect((await api('announcements/show', { announcementId }, bob)).body.myReaction).toBe('👍');
			await api('admin/announcements/delete', { id: announcementId }, alice);
			const db = await initTestDb(true);
			try {
				expect(await db.getRepository(MiAnnouncementReaction).countBy({ announcementId })).toBe(0);
			} finally {
				await db.destroy();
			}
		});

		test('カスタム絵文字のリアクション利用ロールを守る', async () => {
			const announcementId = await createAnnouncement();
			const db = await initTestDb(true);
			try {
				await db.getRepository(MiEmoji).insert({
					id: 'aidxemojitest', name: 't03restricted', host: null,
					originalUrl: 'https://example.com/emoji.png', publicUrl: 'https://example.com/emoji.png',
					roleIdsThatCanBeUsedThisEmojiAsReaction: ['restricted-role'],
				});
				await db.getRepository(MiEmoji).insert({
					id: 'aidxemojiopen', name: 't03open', host: null,
					originalUrl: 'https://example.com/emoji.png', publicUrl: 'https://example.com/emoji.png',
					roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				});
				const res = await api('announcements/react', { announcementId, reaction: ':t03restricted:' }, bob);
				expect(castAsError(res.body).error.code).toBe('INVALID_REACTION');
				const open = await api('announcements/react', { announcementId, reaction: ':t03open@.:' }, bob);
				expect(open.status).toBe(200);
				expect(open.body.myReaction).toBe(':t03open:');
			} finally {
				await db.destroy();
			}
		});

		test('無効な反応と未読時の取消では既読にしない', async () => {
			const announcementId = await createAnnouncement();
			expect(castAsError((await api('announcements/react', { announcementId, reaction: 'invalid' }, bob)).body).error.code).toBe('INVALID_REACTION');
			const canceled = await api('announcements/react', { announcementId, reaction: null }, bob);
			expect(canceled.body).toMatchObject({ isRead: false, reactions: {}, myReaction: null });
		});

		test.each(['not-an-emoji', ':missing:', ':remote@example.com:'])('無効な絵文字 %s は拒否し、現在の反応を維持する', async reaction => {
			const announcementId = await createAnnouncement();
			await api('announcements/react', { announcementId, reaction: '👍' }, bob);
			const res = await api('announcements/react', { announcementId, reaction }, bob);
			expect(castAsError(res.body).error.code).toBe('INVALID_REACTION');
			expect((await api('announcements/show', { announcementId }, bob)).body.myReaction).toBe('👍');
		});
	});

	describe('i login bonus', () => {
		test('同日のログイン後に有効化してもボーナスを一度だけ受け取れる', async () => {
			const user = await signup({ username: 'loginbonus' });
			const before = await api('i', {}, user);
			expect(before.status).toBe(200);
			assert.ok(before.body.points != null);
			await api('admin/update-meta', { enableLoginBonus: true }, alice);
			try {
				const awarded = await api('i', {}, user);
				expect(awarded.status).toBe(200);
				expect(awarded.body.points).toBeGreaterThanOrEqual(before.body.points + 1);
				expect(awarded.body.points).toBeLessThanOrEqual(before.body.points + 5);
				expect(awarded.body.loggedInDays).toBe(before.body.loggedInDays);
				const repeated = await api('i', {}, user);
				expect(repeated.status).toBe(200);
				expect(repeated.body.points).toBe(awarded.body.points);
			} finally {
				await api('admin/update-meta', { enableLoginBonus: false }, alice);
			}
		});
	});

	describe('signup', () => {
		test('不正なユーザー名でアカウントが作成できない', async () => {
			const res = await api('signup', {
				username: 'test.',
				password: 'test',
			});
			assert.strictEqual(res.status, 400);
		});

		test('空のパスワードでアカウントが作成できない', async () => {
			const res = await api('signup', {
				username: 'test',
				password: '',
			});
			assert.strictEqual(res.status, 400);
		});

		test('正しくアカウントが作成できる', async () => {
			const me = {
				username: 'test1',
				password: 'test1',
			};

			const res = await api('signup', me);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.username, me.username);
		});

		test('同じユーザー名のアカウントは作成できない', async () => {
			const res = await api('signup', {
				username: 'test1',
				password: 'test1',
			});

			assert.strictEqual(res.status, 400);
		});
	});

	describe('signin-flow', () => {
		test('間違ったパスワードでサインインできない', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				password: 'bar',
			});

			assert.strictEqual(res.status, 403);
		});

		test('クエリをインジェクションできない', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				// @ts-expect-error password must be string
				password: {
					$gt: '',
				},
			});

			assert.strictEqual(res.status, 400);
		});

		test('正しい情報でサインインできる', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				password: 'test1',
			});

			assert.strictEqual(res.status, 200);
		});
	});

	describe('i/update', () => {
		test('アカウント設定を更新できる', async () => {
			const myName = '大室櫻子';
			const myLocation = '七森中';
			const myBirthday = '2000-09-07';

			const res = await api('i/update', {
				name: myName,
				location: myLocation,
				birthday: myBirthday,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, myName);
			assert.strictEqual(res.body.location, myLocation);
			assert.strictEqual(res.body.birthday, myBirthday);
		});

		test('名前を空白のみにした場合nullになる', async () => {
			const res = await api('i/update', {
				name: ' ',
			}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.name, null);
		});

		test('名前の前後に空白（ホワイトスペース）を入れてもトリムされる', async () => {
			const res = await api('i/update', {
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#white_space
				name: ' あ い う \u0009\u000b\u000c\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff',
			}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.name, 'あ い う');
		});

		test('誕生日の設定を削除できる', async () => {
			await api('i/update', {
				birthday: '2000-09-07',
			}, alice);

			const res = await api('i/update', {
				birthday: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.birthday, null);
		});

		test('不正な誕生日の形式で怒られる', async () => {
			const res = await api('i/update', {
				birthday: '2000/09/07',
			}, alice);
			assert.strictEqual(res.status, 400);
		});
	});

	describe('users/show', () => {
		test('ユーザーが取得できる', async () => {
			const res = await api('users/show', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual((res.body as unknown as { id: string }).id, alice.id);
		});

		test('ユーザーが存在しなかったら怒る', async () => {
			const res = await api('users/show', {
				userId: '000000000000000000000000',
			});
			assert.strictEqual(res.status, 404);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('users/show', {
				userId: 'kyoppie',
			});
			assert.strictEqual(res.status, 404);
		});
	});

	describe('notes/show', () => {
		test('投稿が取得できる', async () => {
			const myPost = await post(alice, {
				text: 'test',
			});

			const res = await api('notes/show', {
				noteId: myPost.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.id, myPost.id);
			assert.strictEqual(res.body.text, myPost.text);
		});

		test('投稿が存在しなかったら怒る', async () => {
			const res = await api('notes/show', {
				noteId: '000000000000000000000000',
			});
			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('notes/show', {
				noteId: 'kyoppie',
			});
			assert.strictEqual(res.status, 400);
		});
	});

	describe('notes/reactions/create', () => {
		test('リアクションできる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);

			const resNote = await api('notes/show', {
				noteId: bobPost.id,
			}, alice);

			assert.strictEqual(resNote.status, 200);
			assert.strictEqual(resNote.body.reactions['🚀'], 1);
		});

		test('自分の投稿にもリアクションできる', async () => {
			const myPost = await post(alice, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: myPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('同じユーザーが異なるリアクションを追加できる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🥰',
			}, alice);

			const res = await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);

			const resNote = await api('notes/show', {
				noteId: bobPost.id,
			}, alice);

			assert.strictEqual(resNote.status, 200);
			assert.deepStrictEqual(resNote.body.reactions, { '🥰': 1, '🚀': 1 });
		});

		test('存在しない投稿にはリアクションできない', async () => {
			const res = await api('notes/reactions/create', {
				noteId: '000000000000000000000000',
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('リノートにリアクションできない', async () => {
			const bobNote = await post(bob, { text: 'hi' });
			const bobRenote = await post(bob, { renoteId: bobNote.id });

			const res = await api('notes/reactions/create', {
				noteId: bobRenote.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.ok(res.body);
			assert.strictEqual(castAsError(res.body).error.code, 'CANNOT_REACT_TO_RENOTE');
		});

		test('引用にリアクションできる', async () => {
			const bobNote = await post(bob, { text: 'hi' });
			const bobRenote = await post(bob, { text: 'hi again', renoteId: bobNote.id });

			const res = await api('notes/reactions/create', {
				noteId: bobRenote.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('空文字列のリアクションは\u2764にフォールバックされる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobNote.id,
				reaction: '',
			}, alice);

			assert.strictEqual(res.status, 204);

			const reaction = await api('notes/reactions', {
				noteId: bobNote.id,
			});

			assert.strictEqual(reaction.body.length, 1);
			assert.strictEqual(reaction.body[0].type, '\u2764');
		});

		test('絵文字ではない文字列のリアクションは\u2764にフォールバックされる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobNote.id,
				reaction: 'Hello!',
			}, alice);

			assert.strictEqual(res.status, 204);

			const reaction = await api('notes/reactions', {
				noteId: bobNote.id,
			});

			assert.strictEqual(reaction.body.length, 1);
			assert.strictEqual(reaction.body[0].type, '\u2764');
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error param must not be empty
			const res = await api('notes/reactions/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('notes/reactions/create', {
				noteId: 'kyoppie',
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('following/create', () => {
		test('フォローできる', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 200);

			const connection = await initTestDb(true);
			const Users = connection.getRepository(MiUser);
			const newBob = await Users.findOneByOrFail({ id: bob.id });
			assert.strictEqual(newBob.followersCount, 0);
			assert.strictEqual(newBob.followingCount, 1);
			const newAlice = await Users.findOneByOrFail({ id: alice.id });
			assert.strictEqual(newAlice.followersCount, 1);
			assert.strictEqual(newAlice.followingCount, 0);
			connection.destroy();
		});

		test('既にフォローしている場合は怒る', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないユーザーはフォローできない', async () => {
			const res = await api('following/create', {
				userId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('自分自身はフォローできない', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('following/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('following/create', {
				userId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('following/delete', () => {
		test('フォロー解除できる', async () => {
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const res = await api('following/delete', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 200);

			const connection = await initTestDb(true);
			const Users = connection.getRepository(MiUser);
			const newBob = await Users.findOneByOrFail({ id: bob.id });
			assert.strictEqual(newBob.followersCount, 0);
			assert.strictEqual(newBob.followingCount, 0);
			const newAlice = await Users.findOneByOrFail({ id: alice.id });
			assert.strictEqual(newAlice.followersCount, 0);
			assert.strictEqual(newAlice.followingCount, 0);
			connection.destroy();
		});

		test('フォローしていない場合は怒る', async () => {
			const res = await api('following/delete', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないユーザーはフォロー解除できない', async () => {
			const res = await api('following/delete', {
				userId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('自分自身はフォロー解除できない', async () => {
			const res = await api('following/delete', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('following/delete', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('following/delete', {
				userId: 'kyoppie',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('channels/search', () => {
		test('空白検索で一覧を取得できる', async () => {
			await api('channels/create', {
				name: 'aaa',
				description: 'bbb',
			}, bob);
			await api('channels/create', {
				name: 'ccc1',
				description: 'ddd1',
			}, bob);
			await api('channels/create', {
				name: 'ccc2',
				description: 'ddd2',
			}, bob);

			const res = await api('channels/search', {
				query: '',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 3);
		});
		test('名前のみの検索で名前を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'aaa',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'aaa');
		});
		test('名前のみの検索で名前を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
		test('名前のみの検索で説明は検索できない', async () => {
			const res = await api('channels/search', {
				query: 'bbb',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 0);
		});
		test('名前と説明の検索で名前を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc1',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'ccc1');
		});
		test('名前と説明での検索で説明を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ddd1',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'ccc1');
		});
		test('名前と説明の検索で名前を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
		test('名前と説明での検索で説明を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ddd',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
	});

	describe('drive', () => {
		test('ドライブ情報を取得できる', async () => {
			const res = await api('drive', {}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			expect(res.body).toHaveProperty('usage', 0);
		});
	});

	describe('drive/files/create', () => {
		const assignRole = async (userId: string, policies: Record<string, unknown>) => {
			const createdRole = await role(alice, {}, policies);

			const assign = await api('admin/roles/assign', {
				userId,
				roleId: createdRole.id,
			}, alice);

			assert.strictEqual(assign.status, 204);

			return createdRole;
		};

		const cleanupRole = async (userId: string, roleId: string) => {
			await api('admin/roles/unassign', {
				userId,
				roleId,
			}, alice);

			await api('admin/roles/delete', {
				roleId,
			}, alice);
		};

		test('ファイルを作成できる', async () => {
			const res = await uploadFile(alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, '192.jpg');
		});

		test('ファイルに名前を付けられる', async () => {
			const res = await uploadFile(alice, { name: 'Belmond.jpg' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'Belmond.jpg');
		});

		test('ファイルに名前を付けられるが、拡張子は正しいものになる', async () => {
			const res = await uploadFile(alice, { name: 'Belmond.png' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'Belmond.png.jpg');
		});

		test('ファイル無しで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('drive/files/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('SVGファイルを作成できる', async () => {
			const res = await uploadFile(alice, { path: 'image.svg' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'image.svg');
			assert.strictEqual(res.body!.type, 'image/svg+xml');
		});

		for (const type of ['webp', 'avif']) {
			const mediaType = `image/${type}`;

			const getWebpublicType = async (user: misskey.entities.SignupResponse, fileId: string): Promise<string> => {
				// drive/files/create does not expose webpublicType directly, so get it by posting it
				const res = await post(user, {
					text: mediaType,
					fileIds: [fileId],
				});
				const apRes = await simpleGet(`notes/${res.id}`, 'application/activity+json');
				assert.strictEqual(apRes.status, 200);
				assert.ok(Array.isArray(apRes.body.attachment));
				return apRes.body.attachment[0].mediaType;
			};

			test(`透明な${type}ファイルを作成できる`, async () => {
				const path = `with-alpha.${type}`;
				const res = await uploadFile(alice, { path });

				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body!.name, path);
				assert.strictEqual(res.body!.type, mediaType);

				const webpublicType = await getWebpublicType(alice, res.body!.id);
				assert.strictEqual(webpublicType, 'image/webp');
			});

			test(`透明じゃない${type}ファイルを作成できる`, async () => {
				const path = `without-alpha.${type}`;
				const res = await uploadFile(alice, { path });
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body!.name, path);
				assert.strictEqual(res.body!.type, mediaType);

				const webpublicType = await getWebpublicType(alice, res.body!.id);
				assert.strictEqual(webpublicType, 'image/webp');
			});
		}

		test('uploadableFileTypes が */* なら任意のファイルをアップロードできる', async () => {
			const createdRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(10)]),
				});

				assert.strictEqual(res.status, 200);
			} finally {
				await cleanupRole(bob.id, createdRole.id);
			}
		});

		test('uploadableFileTypes に含まれない MIME type は拒否される', async () => {
			const createdRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['image/png'],
				},
			});

			try {
				const res = await uploadFile(bob, { path: '192.jpg' });

				assert.strictEqual(res.status, 400);
				assert.ok(res.body);
				assert.strictEqual(castAsError(res.body).error.code, 'UNALLOWED_FILE_TYPE');
			} finally {
				await cleanupRole(bob.id, createdRole.id);
			}
		});

		test('maxFileSizeMb 制限付きロールでも制限内ならアップロードできる', async () => {
			const allowAllTypesRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});
			const tinyAttachmentRole = await assignRole(bob.id, {
				maxFileSizeMb: {
					useDefault: false,
					priority: 1,
					value: 10 / 1024 / 1024, // 10バイト
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(10)]),
				});

				assert.strictEqual(res.status, 200);
			} finally {
				await cleanupRole(bob.id, tinyAttachmentRole.id);
				await cleanupRole(bob.id, allowAllTypesRole.id);
			}
		});

		test('maxFileSizeMb 制限を超えると 413 になる', async () => {
			const allowAllTypesRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});
			const tinyAttachmentRole = await assignRole(bob.id, {
				maxFileSizeMb: {
					useDefault: false,
					priority: 1,
					value: 10 / 1024 / 1024, // 10バイト
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(11)]),
				});

				assert.strictEqual(res.status, 413);
				assert.ok(res.body);
				assert.strictEqual(castAsError(res.body).error.code, 'MAX_FILE_SIZE_EXCEEDED');
			} finally {
				await cleanupRole(bob.id, tinyAttachmentRole.id);
				await cleanupRole(bob.id, allowAllTypesRole.id);
			}
		});
	});

	describe('drive/files/update', () => {
		test('名前を更新できる', async () => {
			const file = (await uploadFile(alice)).body;
			const newName = 'いちごパスタ.png';

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: newName,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, newName);
		});

		test('他人のファイルは更新できない', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: 'いちごパスタ.png',
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('親フォルダを更新できる', async () => {
			const file = (await uploadFile(alice)).body;
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.folderId, folder.id);
		});

		test('親フォルダを無しにできる', async () => {
			const file = (await uploadFile(alice)).body;

			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.folderId, null);
		});

		test('他人のフォルダには入れられない', async () => {
			const file = (await uploadFile(alice)).body;
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, bob)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないフォルダで怒られる', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なフォルダIDで怒られる', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('ファイルが存在しなかったら怒る', async () => {
			const res = await api('drive/files/update', {
				fileId: '000000000000000000000000',
				name: 'いちごパスタ.png',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なファイル名で怒られる', async () => {
			const file = (await uploadFile(alice)).body;
			const newName = '';

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: newName,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('drive/files/update', {
				fileId: 'kyoppie',
				name: 'いちごパスタ.png',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('drive/folders/create', () => {
		test('フォルダを作成できる', async () => {
			const res = await api('drive/folders/create', {
				name: 'test',
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'test');
		});
	});

	describe('drive/folders/update', () => {
		test('名前を更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				name: 'new name',
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'new name');
		});

		test('他人のフォルダを更新できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, bob)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				name: 'new name',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('親フォルダを更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.parentId, parentFolder.id);
		});

		test('親フォルダを無しに更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.parentId, null);
		});

		test('他人のフォルダを親フォルダに設定できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, bob)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: parentFolder.id,
				parentId: folder.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない(再帰的)', async () => {
			const folderA = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const folderB = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const folderC = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: folderB.id,
				parentId: folderA.id,
			}, alice);
			await api('drive/folders/update', {
				folderId: folderC.id,
				parentId: folderB.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folderA.id,
				parentId: folderC.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない(自身)', async () => {
			const folderA = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folderA.id,
				parentId: folderA.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しない親フォルダを設定できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正な親フォルダIDで怒られる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないフォルダを更新できない', async () => {
			const res = await api('drive/folders/update', {
				folderId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なフォルダIDで怒られる', async () => {
			const res = await api('drive/folders/update', {
				folderId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('notes/replies', () => {
		test('自分に閲覧権限のない投稿は含まれない', async () => {
			const alicePost = await post(alice, {
				text: 'foo',
			});

			await post(bob, {
				replyId: alicePost.id,
				text: 'bar',
				visibility: 'specified',
				visibleUserIds: [alice.id],
			});

			const res = await api('notes/replies', {
				noteId: alicePost.id,
			}, carol);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 0);
		});
	});

	describe('notes/timeline', () => {
		test('フォロワー限定投稿が含まれる', async () => {
			await api('following/create', {
				userId: carol.id,
			}, dave);

			const carolPost = await post(carol, {
				text: 'foo',
				visibility: 'followers',
			});

			await vi.waitFor(async () => {
				const res = await api('notes/timeline', {}, dave);

				assert.strictEqual(res.status, 200);
				assert.strictEqual(Array.isArray(res.body), true);
				assert.strictEqual(res.body.length, 1);
				assert.strictEqual(res.body[0].id, carolPost.id);
			}, waitForPushToTlOptions);
		});
	});

	describe('URL preview', () => {
		test('Error from summaly becomes HTTP 422', async () => {
			const res = await simpleGet('/url?url=https://e:xample.com');
			assert.strictEqual(res.status, 422);
			assert.strictEqual(res.body.error.code, 'URL_PREVIEW_FAILED');
		});
	});

	describe('パーソナルメモ機能のテスト', () => {
		test('他者に関するメモを更新できる', async () => {
			const memo = '10月まで低浮上とのこと。';

			const res1 = await api('users/update-memo', {
				memo,
				userId: bob.id,
			}, alice);

			const res2 = await api('users/show', {
				userId: bob.id,
			}, alice);
			assert.strictEqual(res1.status, 204);
			assert.strictEqual((res2.body as unknown as { memo: string })?.memo, memo);
		});

		test('自分に関するメモを更新できる', async () => {
			const memo = 'チケットを月末までに買う。';

			const res1 = await api('users/update-memo', {
				memo,
				userId: alice.id,
			}, alice);

			const res2 = await api('users/show', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(res1.status, 204);
			assert.strictEqual((res2.body as unknown as { memo: string })?.memo, memo);
		});

		test('メモを削除できる', async () => {
			const memo = '10月まで低浮上とのこと。';

			await api('users/update-memo', {
				memo,
				userId: bob.id,
			}, alice);

			await api('users/update-memo', {
				memo: '',
				userId: bob.id,
			}, alice);

			const res = await api('users/show', {
				userId: bob.id,
			}, alice);

			// memoには常に文字列かnullが入っている(5cac151)
			assert.strictEqual((res.body as unknown as { memo: string | null }).memo, null);
		});

		test('メモは個人ごとに独立して保存される', async () => {
			const memoAliceToBob = '10月まで低浮上とのこと。';
			const memoCarolToBob = '例の件について今度問いただす。';

			await Promise.all([
				api('users/update-memo', {
					memo: memoAliceToBob,
					userId: bob.id,
				}, alice),
				api('users/update-memo', {
					memo: memoCarolToBob,
					userId: bob.id,
				}, carol),
			]);

			const [resAlice, resCarol] = await Promise.all([
				api('users/show', {
					userId: bob.id,
				}, alice),
				api('users/show', {
					userId: bob.id,
				}, carol),
			]);

			assert.strictEqual((resAlice.body as unknown as { memo: string }).memo, memoAliceToBob);
			assert.strictEqual((resCarol.body as unknown as { memo: string }).memo, memoCarolToBob);
		});
	});
});
