<script setup lang="ts">
import { NDescriptions, NDescriptionsItem, NModal } from 'naive-ui';

defineOptions({ name: 'RecordDetailModal' });

export interface DetailItem {
  label: string;
  value: unknown;
  /** a long text (JSON, a reason) shown as preformatted text on its own row */
  pre?: boolean;
}

interface Props {
  title: string;
  items: DetailItem[];
}

defineProps<Props>();
const show = defineModel<boolean>('show', { required: true });

const text = (value: unknown) => (value === null || value === undefined || value === '' ? '-' : String(value));
</script>

<template>
  <NModal v-model:show="show" preset="card" :title="title" class="w-760px max-w-95vw">
    <div class="max-h-70vh overflow-y-auto pr-8px">
      <NDescriptions :column="2" size="small" label-placement="left" bordered>
        <NDescriptionsItem v-for="item in items" :key="item.label" :label="item.label" :span="item.pre ? 2 : 1">
          <pre v-if="item.pre" class="m-0 whitespace-pre-wrap break-all text-12px">{{ text(item.value) }}</pre>
          <template v-else>{{ text(item.value) }}</template>
        </NDescriptionsItem>
      </NDescriptions>
      <slot />
    </div>
  </NModal>
</template>
