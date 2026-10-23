import { createApp } from 'vue';
import './plugins/assets';
import { setupVueRootValidator } from 'vite-plugin-vue-transition-root-validator/client';
import {
  setupAppVersionNotification,
  setupChunkLoadErrorReload,
  setupDayjs,
  setupIconifyOffline,
  setupListSearchAutoSubmit,
  setupLoading,
  setupNProgress
} from './plugins';
import { setupStore } from './store';
import { setupRouter } from './router';
import { getLocale, setupI18n } from './locales';
import App from './App.vue';

async function setupApp() {
  setupChunkLoadErrorReload();

  setupLoading();

  setupNProgress();

  setupIconifyOffline();

  setupDayjs();

  const app = createApp(App);

  setupStore(app);

  await setupRouter(app);

  setupI18n(app);

  // every list page's search form submits itself when a condition changes
  setupListSearchAutoSubmit(app);

  setupAppVersionNotification();

  setupVueRootValidator(app, {
    lang: getLocale() === 'zh-CN' ? 'zh' : 'en'
  });

  app.mount('#app');
}

setupApp();
