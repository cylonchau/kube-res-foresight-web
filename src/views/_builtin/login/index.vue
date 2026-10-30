<script setup lang="ts">
import { computed } from 'vue';
import type { Component } from 'vue';
import { getPaletteColorByNumber, mixColor } from '@sa/color';
import { loginModuleRecord } from '@/constants/app';
import { useAppStore } from '@/store/modules/app';
import { useThemeStore } from '@/store/modules/theme';
import { $t } from '@/locales';
import PwdLogin from './modules/pwd-login.vue';
import CodeLogin from './modules/code-login.vue';
import Register from './modules/register.vue';
import ResetPwd from './modules/reset-pwd.vue';
import BindWechat from './modules/bind-wechat.vue';
import OtpLogin from './modules/otp-login.vue';

interface Props {
  /** The login module */
  module?: UnionKey.LoginModule;
}

const props = defineProps<Props>();

const appStore = useAppStore();
const themeStore = useThemeStore();
const currentYear = new Date().getFullYear();

interface LoginModule {
  label: App.I18n.I18nKey;
  component: Component;
}

const moduleMap: Record<UnionKey.LoginModule, LoginModule> = {
  'pwd-login': { label: loginModuleRecord['pwd-login'], component: PwdLogin },
  'code-login': { label: loginModuleRecord['code-login'], component: CodeLogin },
  register: { label: loginModuleRecord.register, component: Register },
  'reset-pwd': { label: loginModuleRecord['reset-pwd'], component: ResetPwd },
  'bind-wechat': { label: loginModuleRecord['bind-wechat'], component: BindWechat },
  'otp-login': { label: loginModuleRecord['otp-login'], component: OtpLogin }
};

const activeModule = computed(() => moduleMap[props.module || 'pwd-login']);

const bgThemeColor = computed(() =>
  themeStore.darkMode ? getPaletteColorByNumber(themeStore.themeColor, 600) : themeStore.themeColor
);

const bgColor = computed(() => {
  const COLOR_WHITE = '#ffffff';

  const ratio = themeStore.darkMode ? 0.5 : 0.2;

  return mixColor(COLOR_WHITE, themeStore.themeColor, ratio);
});
</script>

<template>
  <div
    class="login-shell relative size-full flex-center overflow-hidden"
    :class="{ 'is-dark': themeStore.darkMode }"
    :style="{ '--login-bg': bgColor, '--login-accent': bgThemeColor }"
  >
    <div class="login-decoration" aria-hidden="true" />
    <div class="login-actions relative z-2">
      <ThemeSchemaSwitch
        :theme-schema="themeStore.themeScheme"
        :show-tooltip="false"
        class="text-16px"
        @switch="themeStore.toggleThemeScheme"
      />
      <LangSwitch
        v-if="themeStore.header.multilingual.visible"
        :lang="appStore.locale"
        :lang-options="appStore.localeOptions"
        :show-tooltip="false"
        @change-lang="appStore.changeLocale"
      />
    </div>
    <div class="login-panel relative z-4">
      <header class="login-brand">
        <SystemLogo class="login-brand-logo" />
        <h1>{{ $t('system.title') }}</h1>
        <p>{{ $t('page.login.brand.title') }} · {{ $t('page.login.brand.subtitle') }}</p>
      </header>
      <NCard :bordered="false" class="login-card">
        <!-- the heading and the form change together, in place: the card and the page around it stay where they are -->
        <Transition name="login-swap" mode="out-in">
          <main :key="props.module || 'pwd-login'" class="login-main">
            <h2 class="login-heading">{{ $t(activeModule.label) }}</h2>
            <component :is="activeModule.component" />
          </main>
        </Transition>
      </NCard>
    </div>
    <footer class="login-footer">Copyright © {{ currentYear }} kube-resource-fcst</footer>
  </div>
</template>

<style scoped>
.login-footer {
  position: absolute;
  right: 0;
  bottom: 16px;
  left: 0;
  z-index: 4;
  color: rgba(55, 65, 81, 0.72);
  font-size: 13px;
  text-align: center;
}

.login-shell {
  background: color-mix(in srgb, var(--login-bg) 88%, var(--login-accent));
  flex-direction: column;
  justify-content: flex-start;
  gap: 0;
  padding: 32px 8vw;
}

.login-decoration {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(145deg, transparent 0 48%, rgba(255, 255, 255, 0.9) 48.2% 49%, transparent 49.2%),
    linear-gradient(
      155deg,
      transparent 0 66%,
      color-mix(in srgb, var(--login-accent) 12%, #f3f5f9) 66% 78%,
      transparent 78%
    ),
    linear-gradient(25deg, transparent 0 72%, rgba(255, 255, 255, 0.8) 72% 86%, transparent 86%),
    radial-gradient(circle at 78% 76%, color-mix(in srgb, var(--login-accent) 18%, transparent), transparent 30%),
    #f3f5f9;
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28px;
  text-align: center;
  color: color-mix(in srgb, var(--login-accent) 78%, #172033);
  user-select: none;
  -webkit-user-select: none;
}

.login-brand-logo {
  width: 56px;
  height: 56px;
}

.login-brand h1 {
  margin: 14px 0 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.login-brand p {
  margin: 8px 0 0;
  max-width: calc(100vw - 48px);
  font-size: 14px;
  line-height: 1.5;
  opacity: 0.75;
}

.login-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* the block starts at a fixed height, so the brand does not move when the card grows or shrinks with the form (password, OTP, ...) */
  margin-top: clamp(40px, 15vh, 150px);
}

.login-card {
  width: 420px;
  max-width: calc(100vw - 48px);
  border-radius: 12px;
}

.login-main {
  padding-top: 4px;
}

.login-heading {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
}

.login-swap-enter-active,
.login-swap-leave-active {
  transition: opacity 0.14s ease;
}

.login-swap-enter-from,
.login-swap-leave-to {
  opacity: 0;
}

.login-actions {
  position: absolute;
  top: 12px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--login-accent);
  user-select: none;
  -webkit-user-select: none;
}

.login-actions :deep(.n-icon),
.login-actions :deep(button),
.login-actions :deep(.n-button) {
  color: var(--login-accent) !important;
  font-size: 16px;
}

:deep(.n-card) {
  box-shadow: 0 22px 60px color-mix(in srgb, var(--login-accent) 16%, transparent);
}

.login-card :deep(.n-card-content) {
  padding: 28px 32px 32px !important;
}

/* the rest of the app is dense (global.css sets 12px on controls); the login form is the one page that is read, not scanned: the fields and the checkbox 14px, the button 15px, the placeholders a readable grey */
.login-main :deep(.n-input) {
  font-size: 14px;
}

.login-main :deep(.n-checkbox) {
  --n-font-size: 14px !important;
}

.login-main :deep(.n-button) {
  font-size: 15px;
}

.login-shell.is-dark {
  background: #111827;
}

.login-shell.is-dark .login-decoration {
  background:
    linear-gradient(145deg, transparent 0 48%, rgba(55, 65, 81, 0.72) 48.2% 49%, transparent 49.2%),
    linear-gradient(
      155deg,
      transparent 0 66%,
      color-mix(in srgb, var(--login-accent) 24%, #111827) 66% 78%,
      transparent 78%
    ),
    linear-gradient(25deg, transparent 0 72%, rgba(31, 41, 55, 0.82) 72% 86%, transparent 86%),
    radial-gradient(circle at 78% 76%, color-mix(in srgb, var(--login-accent) 30%, transparent), transparent 30%),
    #111827;
}

.login-shell.is-dark .login-brand,
.login-shell.is-dark .login-actions,
.login-shell.is-dark .login-actions :deep(.n-icon),
.login-shell.is-dark .login-actions :deep(button),
.login-shell.is-dark .login-actions :deep(.n-button) {
  color: color-mix(in srgb, var(--login-accent) 68%, #f9fafb) !important;
}

.login-shell.is-dark :deep(.n-card) {
  background: #1f2937;
}

/*
 * The block that used to live here (:global(html.dark) .login-shell, etc.)
 * was dead code: :global(html.dark) .foo is invalid Vue SFC scoped-CSS
 * syntax (:global() must wrap the whole selector), so the compiler
 * silently dropped every rule in it. It's removed rather than fixed
 * because .login-shell.is-dark above already covers the identical
 * declarations correctly (is-dark is bound to themeStore.darkMode on this
 * component's own root, so it never had the cross-boundary scoping problem
 * :global() was trying to work around).
 */

@media (max-width: 640px) {
  .login-shell {
    padding: 24px 16px;
  }

  .login-brand h1 {
    font-size: 24px;
  }

  .login-brand-logo {
    width: 48px;
    height: 48px;
  }
}
</style>
