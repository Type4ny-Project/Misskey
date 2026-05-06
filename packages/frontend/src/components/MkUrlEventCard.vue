<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
  <span :class="$style.root" target="_blank" rel="noopener noreferrer">
    <div :class="$style.header">
      <div :class="$style.headerItem">
        <span :class="$style.headerText">{{ eventData.title }} </span>
      </div>
      <div :class="$style.headerItem">
        <i class="ti ti-calendar-event" :style="`color:${eventData.color}`"></i>
        <MkTime :time="eventData.startAt" mode="detail" /> ~
        <MkTime v-if="eventData.endAt" :time="eventData.endAt" mode="detail" />
      </div>
      <div v-if="eventData.url" :class="$style.headerItem">
        <i class="ti ti-link" :style="`color:${eventData.color}`"></i>
        <MkLink :url="eventData.url" target="_blank">{{
          eventData.url
        }}</MkLink>
      </div>
      <div v-if="eventData.tags.length > 0" :class="$style.headerItem">
        <i class="ti ti-tag" :style="`color:${eventData.color}`"></i>
        <a
          v-for="tag in eventData.tags"
          :key="tag"
          :style="`color:${eventData.color}`"
          :href="'/tags/' + tag"
          :class="$style.label"
        >
          #{{ tag }}
        </a>
      </div>
    </div>
    <div :class="$style.content">
      <i class="ti ti-file-description" :style="`color:${eventData.color}`"></i>
      <span>{{ eventData.description }}</span>
      <div :class="$style.buttonGroup">
        <MkButton
          v-if="eventData.channelId"
          :style="`color:${eventData.color}`"
          @click="gotoChannel"
        >
          {{ i18n.ts.gotoChannel }}
        </MkButton>
        <MkButton
          v-if="eventData.channelId"
          :style="`color:${eventData.color}`"
          @click="gotoEvent"
        >
          イベントの詳細を見る
        </MkButton>
      </div>
    </div>
  </span>
</template>

<script lang="ts" setup>
import { misskeyApi } from "@/utility/misskey-api";
import MkButton from "@/components/MkButton.vue";
import MkLink from "@/components/MkLink.vue";
import { i18n } from "@/i18n";

const props = defineProps<{
  eventId: string;
}>();

const { eventId } = props;

const eventData = await misskeyApi("events/show", {
  eventId,
});

const eventShowUrl = window.location.origin + "/events/" + eventData.id;

const gotoChannel = () => {
  window.location.href = "/channels/" + eventData.channelId;
};

const gotoEvent = () => {
  window.location.href = eventShowUrl;
};
</script>

<style lang="scss" module>
.root {
  display: inline-flex;
  gap: 6px;
  font-size: 0.9em;
  padding: 12px;
  border: 1px solid var(--MI_THEME-divider);
  border-radius: 8px;
  background: var(--MI_THEME-bg);
  vertical-align: baseline;
  flex-direction: column;
  width: 100%;
  max-width: 90%;
}

.header {
  display: flex;
  gap: 6px;
  flex-direction: column;
}

.headerText {
  display: inline-flex;
  font-weight: 600;
  white-space: nowrap;
}

.headerItem {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.content {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  display: inline-flex;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  color: var(--MI_THEME-fg);
  white-space: nowrap;
}

.buttonGroup {
  display: inline-flex;
  gap: 6px;
  margin-top: 6px;
}
</style>
