/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import MkCallsCameraPreview from './MkCallsCameraPreview.vue';
import type { StoryObj } from '@storybook/vue3';

export const Default = { render: args => ({ components: { MkCallsCameraPreview }, setup: () => ({ args }), template: '<MkCallsCameraPreview v-bind="args"/>' }), args: { deviceId: '' } } satisfies StoryObj<typeof MkCallsCameraPreview>;
