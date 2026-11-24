<script setup lang="ts">
import { computed } from 'vue';
import { NPopover } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import FormulaView from '@/components/common/formula-view.vue';
import SvgIcon from '@/components/custom/svg-icon.vue';
import type { ParamDoc } from '@/utils/param-docs';

defineOptions({ name: 'ParamHelp' });

/**
 * The "?" of a parameter of module management: what it is, what it does, the formula it stands in, an example worked out with the figures of the form and where it applies.
 * The five parts are always there, so a parameter is never explained by one line that leaves out its formula or its scope.
 */
const props = defineProps<{ doc: ParamDoc }>();
const { t } = useI18n();
const parts = computed(() => [
  { key: 'definition', text: props.doc.definition },
  { key: 'role', text: props.doc.role }
]);
</script>

<template>
  <!-- a popover and not a tooltip: it holds a formula and an example, more than the 360px of a tooltip's line of text -->
  <NPopover trigger="hover" placement="bottom-start" :show-arrow="false" class="param-popover">
    <template #trigger>
      <span class="inline-flex cursor-pointer items-center align-middle"><SvgIcon icon="mdi-help-circle" /></span>
    </template>
    <div class="param-help">
      <div v-for="part in parts" :key="part.key" class="param-part">
        <div class="param-part-title">{{ t(`page.forecast.params.part_${part.key}`) }}</div>
        <div>{{ part.text }}</div>
      </div>
      <div class="param-part">
        <div class="param-part-title">{{ t('page.forecast.params.part_formula') }}</div>
        <FormulaView :lines="doc.formula" />
      </div>
      <div class="param-part">
        <div class="param-part-title">{{ t('page.forecast.params.part_example') }}</div>
        <FormulaView :lines="doc.example" />
      </div>
      <div class="param-part">
        <div class="param-part-title">{{ t('page.forecast.params.part_scope') }}</div>
        <div>{{ doc.scope }}</div>
      </div>
    </div>
  </NPopover>
</template>

<style scoped>
.param-help {
  display: grid;
  gap: 8px;
  width: 520px;
  max-width: 88vw;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.param-part-title {
  margin-bottom: 2px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.7;
}
</style>
