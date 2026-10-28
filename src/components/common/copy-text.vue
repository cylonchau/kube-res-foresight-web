<script setup lang="ts">
import { NTooltip } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { copyText } from '@/utils/copy';

defineOptions({ name: 'CopyText' });

/**
 * A value with its own copy icon. Only the icon copies; clicking or selecting the text does nothing, so the text can
 * still be selected by hand.
 */
const props = defineProps<{ text: string; mono?: boolean }>();
const { t } = useI18n();

async function copy() {
  if (await copyText(props.text)) window.$message?.success(t('common.copied'));
  else window.$message?.error(t('common.copyFailed'));
}
</script>

<template>
  <span class="copy-text">
    <span class="copy-text__value" :class="{ 'font-mono': mono }" :title="text">{{ text }}</span>
    <NTooltip v-if="text">
      <template #trigger>
        <span class="copy-text__icon" role="button" tabindex="0" @click.stop="copy" @keydown.enter.stop="copy">
          <SvgIcon icon="mdi:content-copy" />
        </span>
      </template>
      {{ t('common.copy') }}
    </NTooltip>
  </span>
</template>

<style scoped>
.copy-text {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 4px;
}
.copy-text__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-text__icon {
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
  font-size: 13px;
  opacity: 0.5;
}
.copy-text__icon:hover {
  opacity: 1;
  color: rgb(var(--primary-color));
}
</style>
