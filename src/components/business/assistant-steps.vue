<script setup lang="ts">
import { NSpin } from 'naive-ui';
import { useI18n } from 'vue-i18n';

defineOptions({ name: 'AssistantSteps' });

/**
 * The steps an answer was made of: each tool the assistant read, with what it asked for and the start of what it got back, so the person can
 * check the answer against it. While a question is being answered the steps are shown as they happen (a spinner on the one that is running).
 */
defineProps<{ steps: Api.Assistant.ToolTrace[] }>();

const { t } = useI18n();

function label(name: string) {
  return t(`page.assistant.tool_${name}`, name);
}

/** the arguments in one short line: {"module":"shop","days":7} -> module=shop, days=7 */
function summary(args?: string) {
  if (!args) return '';
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>;
    return Object.entries(parsed)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
  } catch {
    return args;
  }
}

/** the result is JSON the tool returned, cut short: shown as it is, readable */
function pretty(result?: string) {
  if (!result) return '';
  try {
    return JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    return result;
  }
}
</script>

<template>
  <div v-if="steps.length" class="assistant-steps">
    <div class="assistant-steps-title">{{ t('page.assistant.stepsTitle', { n: steps.length }) }}</div>
    <details v-for="(step, i) in steps" :key="i" class="assistant-step" :open="false">
      <summary class="assistant-step-line">
        <NSpin v-if="step.running" :size="14" class="assistant-step-icon" />
        <span v-else class="assistant-step-icon" :class="step.ok ? 'is-ok' : 'is-fail'">{{ step.ok ? '✓' : '✕' }}</span>
        <span class="assistant-step-name">{{ label(step.name) }}</span>
        <span class="assistant-step-args">{{ summary(step.arguments) }}</span>
      </summary>
      <div class="assistant-step-body">
        <div v-if="step.error" class="assistant-step-error">{{ step.error }}</div>
        <pre v-if="step.result" class="assistant-step-result">{{ pretty(step.result) }}</pre>
        <div v-else-if="!step.running && !step.error" class="opacity-60">{{ t('page.assistant.stepNoResult') }}</div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.assistant-steps {
  margin-top: 8px;
  border-top: 1px dashed rgba(128, 128, 128, 0.3);
  padding-top: 6px;
  font-size: 12px;
}

.assistant-steps-title {
  opacity: 0.6;
  margin-bottom: 2px;
}

.assistant-step-line {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 2px 0;
  min-width: 0;
}

.assistant-step-icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.assistant-step-icon.is-ok {
  color: rgb(24, 160, 88);
}

.assistant-step-icon.is-fail {
  color: rgb(208, 48, 80);
}

.assistant-step-name {
  font-weight: 500;
  flex-shrink: 0;
}

.assistant-step-args {
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.assistant-step-body {
  margin: 2px 0 6px 20px;
}

.assistant-step-error {
  color: rgb(208, 48, 80);
}

.assistant-step-result {
  margin: 4px 0 0;
  padding: 6px 8px;
  max-height: 220px;
  overflow: auto;
  background: rgba(128, 128, 128, 0.1);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11px;
}
</style>
