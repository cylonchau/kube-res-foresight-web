<script setup lang="ts">
import { NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';

defineOptions({ name: 'PromqlList' });

/**
 * The queries a figure was asked with, written the way Prometheus' own expression browser shows them: the name of the figure, where its text comes from
 * (a metric mapping of the data source, the system parameter, or the default), the PromQL in a monospace block, and the value it answered or why it
 * did not. The cluster figures and the quantiles of a module use the same list, so a query reads the same wherever it is.
 */
export interface PromqlItem {
  name: string;
  query: string;
  /** mapping | parameter | default; empty when the text has no such origin (the PromQL of a module's mapping) */
  source?: string;
  mapping?: string;
  /** the answer, already formatted */
  value?: string;
  error?: string;
}
defineProps<{ items: PromqlItem[] }>();
const { t } = useI18n();
const sourceLabel = (item: PromqlItem) =>
  item.source === 'mapping'
    ? t('page.overprovision.srcMapping', { name: item.mapping || '' })
    : t(`page.overprovision.src_${item.source}`);
const sourceType = (source?: string) =>
  source === 'mapping' ? 'success' : source === 'parameter' ? 'info' : 'default';
</script>

<template>
  <div class="promql-list">
    <div v-for="item in items" :key="item.name" class="promql-item" :class="{ 'is-failed': item.error }">
      <div class="promql-head">
        <span class="promql-name">{{ item.name }}</span>
        <NTag v-if="item.source" size="tiny" :bordered="false" :type="sourceType(item.source)">
          {{ sourceLabel(item) }}
        </NTag>
        <span v-if="item.value" class="promql-value">= {{ item.value }}</span>
      </div>
      <pre class="promql-code">{{ item.query }}</pre>
      <div v-if="item.error" class="promql-error">{{ item.error }}</div>
    </div>
  </div>
</template>

<style scoped>
.promql-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.promql-item {
  padding-left: 10px;
  border-left: 3px solid rgba(128, 128, 128, 0.35);
}
.promql-item.is-failed {
  border-left-color: #d03050;
}
.promql-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.promql-name {
  font-weight: 600;
}
.promql-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  opacity: 0.85;
}
.promql-code {
  margin: 4px 0 0;
  padding: 6px 10px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-all;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.1);
}
.promql-error {
  margin-top: 2px;
  font-size: 12px;
  color: #d03050;
}
</style>
