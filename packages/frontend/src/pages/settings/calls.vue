<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/calls" :label="i18n.ts._calls.settings" :keywords="['calls', 'microphone', 'camera', 'volume']" icon="ti ti-phone">
	<MkCallsGeneralSettings :getSettings="session.getAudioSettings" :setNoiseSuppression="session.setNoiseSuppression" :setInputSensitivity="session.setInputSensitivity" :setInputVolume="session.setInputVolume" :setOutputVolume="session.setOutputVolume" :setDevice="session.setDevice" :refreshDevices="session.refreshDevices"/>
</SearchMarker>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import MkCallsGeneralSettings from '@/components/MkCallsGeneralSettings.vue';
import { useCallsSession } from '@/utility/calls-session.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const session = useCallsSession();
onMounted(() => session.prepareMicrophones());
definePage(() => ({ title: i18n.ts._calls.settings, icon: 'ti ti-phone' }));
</script>
