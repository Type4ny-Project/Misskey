/*
 * SPDX-FileCopyrightText: Type4ny-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MultipleReactions1772208000002 {
    name = 'MultipleReactions1772208000002'

    async up(queryRunner) {
        // 古いユニークインデックスを削除（userId + noteId）
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_note_reaction_userId_noteId"
        `);
        
        // 新しいユニークインデックスを作成（userId + noteId + reaction）
        // これにより同じユーザーが同じノートに異なるリアクションを複数付けられるようになる
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_note_reaction_userId_noteId_reaction" 
            ON "note_reaction" ("userId", "noteId", "reaction")
        `);
        
        // 非ユニークインデックスも作成（userId + noteId の検索用）
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_note_reaction_userId_noteId" 
            ON "note_reaction" ("userId", "noteId")
        `);
    }

    async down(queryRunner) {
        // 新しいインデックスを削除
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_note_reaction_userId_noteId_reaction"
        `);
        
        // 古いユニークインデックスを復元
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_note_reaction_userId_noteId"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_note_reaction_userId_noteId" 
            ON "note_reaction" ("userId", "noteId")
        `);
    }
}
