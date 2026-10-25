<script setup lang="ts">
import { NButton, NCard, NCollapse, NCollapseItem, NForm, NGi, NGrid, NSpace } from 'naive-ui';

defineOptions({ name: 'ListSearchCard' });

interface Props {
  /** The page's filters. The list-search plugin watches it and submits the search when it changes. */
  model: Record<string, any>;
  /** Columns of the 24-column grid the search and reset buttons take. */
  actionSpan?: number;
}

withDefaults(defineProps<Props>(), { actionSpan: 6 });

const emit = defineEmits<{ search: []; reset: [] }>();
</script>

<template>
  <NCard :bordered="false" size="small" class="list-search-card rounded-16px shadow-sm">
    <NCollapse class="list-search-collapse" :default-expanded-names="['1']">
      <NCollapseItem :title="$t('common.search')" name="1">
        <NForm class="list-search-form" inline :model="model" label-placement="top" :show-feedback="false">
          <NGrid class="list-search-row" :cols="24" :x-gap="24">
            <slot />
            <NGi class="list-search-actions" :span="actionSpan">
              <NSpace justify="end" class="w-full">
                <NButton @click="emit('reset')">{{ $t('common.reset') }}</NButton>
                <NButton type="primary" @click="emit('search')">{{ $t('common.search') }}</NButton>
              </NSpace>
            </NGi>
          </NGrid>
        </NForm>
      </NCollapseItem>
    </NCollapse>
  </NCard>
</template>
