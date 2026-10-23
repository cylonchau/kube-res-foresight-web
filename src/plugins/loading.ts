// @unocss-include
import { getColorPalette, getRgb } from '@sa/color';
import { DARK_CLASS } from '@/constants/app';
import { localStg } from '@/utils/storage';
import { toggleHtmlClass } from '@/utils/common';
import { $t } from '@/locales';

export function setupLoading() {
  const themeColor = localStg.get('themeColor') || '#646cff';
  const darkMode = localStg.get('darkMode') || false;
  const palette = getColorPalette(themeColor);

  const { r, g, b } = getRgb(themeColor);

  const primaryColor = `--primary-color: ${r} ${g} ${b}`;

  const svgCssVars = Array.from(palette.entries())
    .map(([key, value]) => `--logo-color-${key}: ${value}`)
    .join(';');

  const cssVars = `${primaryColor}; ${svgCssVars}`;

  if (darkMode) {
    toggleHtmlClass(DARK_CLASS).add();
  }

  const loadingClasses = [
    'left-0 top-0',
    'left-0 bottom-0 animate-delay-500',
    'right-0 top-0 animate-delay-1000',
    'right-0 bottom-0 animate-delay-1500'
  ];

  const dot = loadingClasses
    .map(item => {
      return `<div class="absolute w-15px h-15px bg-primary rounded-full animate-pulse ${item}"></div>`;
    })
    .join('\n');

  const logoSrc = '/kubeforecast-logo.svg';

  const loading = `
<div class="fixed-center flex-col bg-layout" style="${cssVars}">
  <div class="w-52px h-52px mb-28px">
    <div class="relative h-full animate-spin">
      ${dot}
    </div>
  </div>
  <div class="flex items-center justify-center gap-12px px-20px py-8px rounded-16px bg-primary/5 border border-primary/15 shadow-sm select-none">
    <div class="w-40px h-40px shrink-0 flex items-center justify-center">
      <img src="${logoSrc}" alt="KubeForecast" class="w-full h-full object-contain drop-shadow-sm" />
    </div>
    <h2 class="m-0 text-22px font-bold text-primary tracking-wide leading-normal pt-1px">${$t('system.title')}</h2>
  </div>
</div>`;

  const app = document.getElementById('app');

  if (app) {
    app.innerHTML = loading;
  }
}
