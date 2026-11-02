<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
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

// the size of the window: dragged from its left edge, bottom edge or corner, and kept for the next visit; "expanded" fills the right side
const SIZE_KEY = 'assistant_panel_size';
const MIN = { width: 360, height: 360 };
const size = reactive({ width: 420, height: 620 });
const expanded = ref(false);
try {
  const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}');
  if (saved.width >= MIN.width) size.width = saved.width;
  if (saved.height >= MIN.height) size.height = saved.height;
  expanded.value = saved.expanded === true;
} catch {
  // the stored size is a convenience: without it the default one is used
}
function remember() {
  try {
    localStorage.setItem(
      SIZE_KEY,
      JSON.stringify({ width: size.width, height: size.height, expanded: expanded.value })
    );
  } catch {
    // no storage: the size lasts until the page is closed
  }
}
const panelStyle = computed(() => {
  const base = { top: top.value, ...colors.value };
  if (appStore.isMobile) return base;
  if (expanded.value)
    return {
      ...base,
      width: `${Math.max(MIN.width, Math.min(size.width * 1.6, window.innerWidth * 0.6))}px`,
      height: 'auto',
      bottom: '0',
      right: '0',
      borderRadius: '0'
    };
  return {
    ...base,
    width: `${Math.min(size.width, window.innerWidth - 32)}px`,
    height: `${Math.min(size.height, window.innerHeight - themeStore.header.height - 16)}px`
  };
});
function toggleExpanded() {
  expanded.value = !expanded.value;
  remember();
}
function startResize(event: PointerEvent, horizontal: boolean, vertical: boolean) {
  if (appStore.isMobile) return;
  event.preventDefault();
  const x = event.clientX;
  const y = event.clientY;
  const from = { width: size.width, height: size.height };
  const move = (e: PointerEvent) => {
    if (horizontal)
      size.width = Math.round(Math.min(window.innerWidth - 32, Math.max(MIN.width, from.width + (x - e.clientX))));
    if (vertical)
      size.height = Math.round(
        Math.min(
          window.innerHeight - themeStore.header.height - 16,
          Math.max(MIN.height, from.height + (e.clientY - y))
        )
      );
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    remember();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

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
          :class="{ 'is-mobile': appStore.isMobile, 'is-expanded': expanded && !appStore.isMobile }"
          :style="panelStyle"
          role="dialog"
          :aria-label="t('page.assistant.title')"
        >
          <template v-if="!appStore.isMobile && !expanded">
            <div class="assistant-resize is-left" @pointerdown="startResize($event, true, false)" />
            <div class="assistant-resize is-bottom" @pointerdown="startResize($event, false, true)" />
            <div class="assistant-resize is-corner" @pointerdown="startResize($event, true, true)" />
          </template>
          <header class="assistant-panel-header">
            <span class="font-medium">{{ t('page.assistant.title') }}</span>
            <span class="inline-flex items-center gap-4px">
              <NButton
                v-if="!appStore.isMobile"
                size="tiny"
                quaternary
                class="assistant-expand"
                @click="toggleExpanded"
              >
                {{ expanded ? t('page.assistant.restore') : t('page.assistant.expand') }}
              </NButton>
              <NButton size="tiny" quaternary @click="store.panelOpen = false">{{ t('common.close') }}</NButton>
            </span>
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

.assistant-panel.is-expanded {
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
}

.assistant-resize {
  position: absolute;
  z-index: 1;
}

.assistant-resize.is-left {
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 6px;
  cursor: ew-resize;
}

.assistant-resize.is-bottom {
  right: 12px;
  bottom: 0;
  left: 12px;
  height: 6px;
  cursor: ns-resize;
}

.assistant-resize.is-corner {
  bottom: 0;
  left: 0;
  width: 14px;
  height: 14px;
  cursor: nesw-resize;
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
