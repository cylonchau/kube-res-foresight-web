<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import { NButton, useThemeVars } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import AssistantChat from '@/components/business/assistant-chat.vue';
import { useAppStore } from '@/store/modules/app';
import { useAssistantStore } from '@/store/modules/assistant';
import { useAuthStore } from '@/store/modules/auth';
import { useThemeStore } from '@/store/modules/theme';

defineOptions({ name: 'AssistantButton' });

/**
 * The assistant at the top right of the header: a button, and under it a window with the conversation, over whichever page the user is
 * on. It is there only for a user whose role may ask it (the permission "assistant:chat"), and only while the switch of the assistant
 * (the system parameter assistant.enabled) is on: switch it off and the button and the window go away, wherever they are open.
 */
const { t } = useI18n();
const store = useAssistantStore();
const appStore = useAppStore();
const authStore = useAuthStore();
const themeStore = useThemeStore();

const mayAsk = computed(() => authStore.userInfo.buttons.includes('assistant:chat'));
const shown = computed(() => mayAsk.value && store.enabled);

const vars = useThemeVars();
// the window is placed on the body, outside the theme provider's elements: it takes the theme's colours from the theme itself
const top = computed(() => `${themeStore.header.height + 6}px`);
const colors = computed(() => ({ background: vars.value.modalColor, color: vars.value.textColor2 }));

function refresh() {
  if (mayAsk.value) store.loadStatus();
}
onMounted(refresh);
// the switch is read again when the person comes back to this tab, and when the permissions of the login arrive
useEventListener(window, 'focus', refresh);
watch(mayAsk, refresh);
</script>

<template>
  <template v-if="shown">
    <ButtonIcon
      icon="carbon:bot"
      :tooltip-content="t('page.assistant.title')"
      :class="store.panelOpen ? 'assistant-button text-primary' : 'assistant-button'"
      @click="store.panelOpen = !store.panelOpen"
    />
    <Teleport to="body">
      <Transition name="assistant-panel">
        <section
          v-show="store.panelOpen"
          class="assistant-panel"
          :class="{ 'is-mobile': appStore.isMobile }"
          :style="{ top, ...colors }"
          role="dialog"
          :aria-label="t('page.assistant.title')"
        >
          <header class="assistant-panel-header">
            <span class="font-medium">{{ t('page.assistant.title') }}</span>
            <NButton size="tiny" quaternary @click="store.panelOpen = false">{{ t('common.close') }}</NButton>
          </header>
          <AssistantChat class="min-h-0 flex-1" />
        </section>
      </Transition>
    </Teleport>
  </template>
</template>

<style scoped>
.assistant-panel {
  position: fixed;
  right: 16px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  width: 420px;
  height: min(620px, calc(100vh - 80px));
  overflow: hidden;
  border-radius: 12px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(128, 128, 128, 0.2);
}

.assistant-panel.is-mobile {
  right: 8px;
  left: 8px;
  width: auto;
}

.assistant-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}

.assistant-panel-enter-active,
.assistant-panel-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.assistant-panel-enter-from,
.assistant-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
