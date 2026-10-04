/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkCallsCreateDialog from './MkCallsCreateDialog.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = {
	render() { return { components: { MkCallsCreateDialog }, template: '<MkCallsCreateDialog />' }; },
	parameters: { layout: 'fullscreen' },
} satisfies StoryObj<typeof MkCallsCreateDialog>;
