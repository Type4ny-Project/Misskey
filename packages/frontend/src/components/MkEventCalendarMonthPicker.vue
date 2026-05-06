<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
  <MkModal
    ref="modal"
    v-slot="{ type }"
    :zPriority="'high'"
    :anchorElement="anchorElement"
    :transparentBg="true"
    @click="modal?.close()"
    @closed="emit('closed')"
    @esc="modal?.close()"
  >
    <div :class="[$style.root, { [$style.asDrawer]: type === 'drawer' }]">
      <div :class="$style.yearNav">
        <button class="_button" :class="$style.yearNavBtn" @click="prevYear">
          <i class="ti ti-chevron-left"></i>
        </button>
        <span :class="$style.yearLabel"
          >{{ pickerYear }}{{ i18n.ts._events.year }}</span
        >
        <button class="_button" :class="$style.yearNavBtn" @click="nextYear">
          <i class="ti ti-chevron-right"></i>
        </button>
      </div>
      <div :class="$style.months">
        <button
          v-for="(monthLabel, index) in monthLabels"
          :key="index"
          class="_button"
          :class="[
            $style.monthCell,
            {
              [$style.monthCurrent]: isCurrentMonth(index),
              [$style.monthToday]: isTodayMonth(index),
            },
          ]"
          @click="selectMonth(index)"
        >
          {{ monthLabel }}
        </button>
      </div>
    </div>
  </MkModal>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from "vue";
import MkModal from "@/components/MkModal.vue";
import { i18n } from "@/i18n.js";
import { lang } from "@@/js/config.js";

const isJapaneseLanguage = lang.startsWith("ja");

const props = defineProps<{
  anchorElement?: HTMLElement | null;
  year: number;
  currentMonth: number;
}>();

const emit = defineEmits<{
  (ev: "select", value: { year: number; month: number }): void;
  (ev: "closed"): void;
}>();

const modal = useTemplateRef("modal");
const pickerYear = ref(props.year);
const today = new Date();

const monthLabels = computed(() =>
  Array.from({ length: 12 }, (_, index) => {
    if (isJapaneseLanguage) {
      return `${index + 1}${i18n.ts._events.month || "月"}`;
    }
    const date = new Date(2000, index, 1);
    return date.toLocaleDateString(lang, { month: "short" });
  }),
);

function prevYear(): void {
  pickerYear.value--;
}

function nextYear(): void {
  pickerYear.value++;
}

function isCurrentMonth(index: number): boolean {
  return pickerYear.value === props.year && index === props.currentMonth;
}

function isTodayMonth(index: number): boolean {
  return pickerYear.value === today.getFullYear() && index === today.getMonth();
}

function selectMonth(index: number): void {
  emit("select", { year: pickerYear.value, month: index });
  modal.value?.close();
}
</script>

<style lang="scss" module>
.root {
  width: 280px;
  padding: 16px;
  border-radius: 16px;
  background: var(--MI_THEME-panel);

  &.asDrawer {
    width: 100%;
    max-width: none;
    border-radius: 24px;
    border-bottom-right-radius: 0;
    border-bottom-left-radius: 0;
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 16px);
  }
}

.yearNav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 4px;
}

.yearNavBtn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--MI_THEME-fg);

  &:hover {
    background: var(--MI_THEME-buttonHoverBg);
  }
}

.yearLabel {
  font-size: 1em;
  font-weight: 700;
  color: var(--MI_THEME-fg);
}

.months {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.monthCell {
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.88em;
  font-weight: 600;
  color: var(--MI_THEME-fg);
  transition: background 0.15s;

  &:hover {
    background: var(--MI_THEME-buttonHoverBg);
  }
}

.monthCurrent {
  background: var(--MI_THEME-accent);
  color: var(--MI_THEME-fgOnAccent);

  &:hover {
    background: var(--MI_THEME-accent);
    filter: brightness(1.08);
  }
}

.monthToday {
  box-shadow: inset 0 0 0 2px var(--MI_THEME-accent);
}
</style>
