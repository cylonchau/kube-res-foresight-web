<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NDropdown } from 'naive-ui';
import { useI18n } from 'vue-i18n';

defineOptions({ name: 'BatchActions' });

export interface BatchAction {
  key: string;
  label: string;
  /** a destructive action asks for confirmation before it runs */
  danger?: boolean;
}

interface Props {
  /** how many rows are checked; the menu is disabled while none is */
  count: number;
  actions: BatchAction[];
}

const props = defineProps<Props>();
const emit = defineEmits<{ run: [key: string] }>();
const { t } = useI18n();

const options = computed(() => props.actions.map(item => ({ key: item.key, label: item.label })));

function select(key: string) {
  const action = props.actions.find(item => item.key === key);
  if (!action) return;
  if (!action.danger) {
    emit('run', key);
    return;
  }
  window.$dialog?.warning({
    title: action.label,
    content: t('common.confirmBatchDelete'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => emit('run', key)
  });
}
</script>

<template>
  <NDropdown trigger="click" :options="options" :disabled="count === 0" @select="select">
    <NButton size="small" :disabled="count === 0">
      {{ t('common.batchActions') }}
      <template v-if="count">({{ count }})</template>
    </NButton>
  </NDropdown>
</template>
