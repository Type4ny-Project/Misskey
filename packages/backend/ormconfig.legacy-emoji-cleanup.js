/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import dataSource from './ormconfig.js';
import { DropLegacyEmojiRequest1792642930323 } from './migration/1792642930323-drop-legacy-emoji-request.js';

// Run this cleanup first when a legacy primary key blocks AlignSchema.
dataSource.setOptions({ migrations: [DropLegacyEmojiRequest1792642930323] });

export default dataSource;
