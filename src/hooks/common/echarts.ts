import { computed, effectScope, nextTick, onScopeDispose, shallowRef, watch } from 'vue';
import { useElementSize } from '@vueuse/core';
import * as echarts from 'echarts/core';
import {
  BarChart,
  CandlestickChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  PictorialBarChart,
  PieChart,
  RadarChart,
  ScatterChart
} from 'echarts/charts';
import type {
  BarSeriesOption,
  CandlestickSeriesOption,
  GaugeSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  PictorialBarSeriesOption,
  PieSeriesOption,
  RadarSeriesOption,
  ScatterSeriesOption
} from 'echarts/charts';
import {
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent
} from 'echarts/components';
import type {
  DataZoomComponentOption,
  DatasetComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TitleComponentOption,
  ToolboxComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import { useThemeStore } from '@/store/modules/theme';

export type ECOption = echarts.ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | CandlestickSeriesOption
  | PieSeriesOption
  | ScatterSeriesOption
  | PictorialBarSeriesOption
  | RadarSeriesOption
  | GaugeSeriesOption
  | HeatmapSeriesOption
  | TitleComponentOption
  | LegendComponentOption
  | TooltipComponentOption
  | GridComponentOption
  | ToolboxComponentOption
  | DatasetComponentOption
  | DataZoomComponentOption
  | VisualMapComponentOption
>;

echarts.use([
  TitleComponent,
  LegendComponent,
  TooltipComponent,
  GridComponent,
  DatasetComponent,
  TransformComponent,
  ToolboxComponent,
  DataZoomComponent,
  VisualMapComponent,
  HeatmapChart,
  BarChart,
  LineChart,
  CandlestickChart,
  PieChart,
  ScatterChart,
  PictorialBarChart,
  RadarChart,
  GaugeChart,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer
]);

/**
 * What makes a chart feel like Grafana's, set under the options of every chart: the tooltip follows the pointer at once (the
 * default eases it over 0.4 s, which reads as lag), a dashed vertical line snaps to the nearest point, and an update moves the lines over 0.2 s instead of redrawing them.
 */
const SMOOTH_DEFAULTS: ECOption = {
  animationDurationUpdate: 200,
  tooltip: {
    transitionDuration: 0,
    hideDelay: 50,
    axisPointer: { type: 'line', snap: true, lineStyle: { type: 'dashed', width: 1 } }
  }
};

interface ChartHooks {
  onRender?: (chart: echarts.ECharts) => void | Promise<void>;
  onUpdated?: (chart: echarts.ECharts) => void | Promise<void>;
  onDestroy?: (chart: echarts.ECharts) => void | Promise<void>;
}

/**
 * use echarts
 *
 * @param optionsFactory echarts options factory function
 * @param darkMode dark mode
 */
export function useEcharts<T extends ECOption>(optionsFactory: () => T, hooks: ChartHooks = {}) {
  const scope = effectScope();

  const themeStore = useThemeStore();
  const darkMode = computed(() => themeStore.darkMode);

  const domRef = shallowRef<HTMLElement | null>(null);
  const initialSize = { width: 0, height: 0 };
  const { width, height } = useElementSize(domRef, initialSize);

  const chart = shallowRef<echarts.ECharts | null>(null);
  const chartOptions: T = optionsFactory();

  const {
    onRender = instance => {
      const textColor = darkMode.value ? 'rgb(224, 224, 224)' : 'rgb(31, 31, 31)';
      const maskColor = darkMode.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.8)';

      instance.showLoading({
        color: themeStore.themeColor,
        textColor,
        fontSize: 14,
        maskColor
      });
    },
    onUpdated = instance => {
      instance.hideLoading();
    },
    onDestroy
  } = hooks;

  /** is chart rendered */
  function isRendered() {
    // An instance counts only while it still draws into the element that is on the page: a dialog that is closed and
    // opened again gets a new element, and the instance of the old one must not stand in for it (it was resized and
    // updated while detached, which threw, and the new element stayed empty).
    const instance = chart.value;
    return Boolean(domRef.value && instance && !instance.isDisposed() && instance.getDom() === domRef.value);
  }

  /**
   * update chart options
   *
   * @param callback callback function
   */
  async function updateOptions(callback: (opts: T, optsFactory: () => T) => ECOption = () => chartOptions) {
    const updatedOpts = callback(chartOptions, optionsFactory);

    Object.assign(chartOptions, updatedOpts);

    await nextTick();

    if (!isRendered()) return;

    // The chart is updated in place, never cleared: a clear blanks the plot for a frame (a flicker on every refresh) and drops the
    // zoom the user chose. Only the series are replaced, so a series that is gone from the data goes from the plot too; the
    // zoom, the legend choice and the axes are merged and keep their state.
    chart.value?.setOption({ ...updatedOpts, backgroundColor: 'transparent' }, { replaceMerge: ['series'] });

    await onUpdated?.(chart.value!);
  }

  function setOptions(options: T) {
    chart.value?.setOption(options);
  }

  /** render chart */
  async function render() {
    const element = domRef.value;
    if (!element || element.clientWidth <= 0 || element.clientHeight <= 0) return;

    if (chart.value && (chart.value.isDisposed() || chart.value.getDom() !== element)) {
      if (!chart.value.isDisposed()) chart.value.dispose();
      chart.value = null;
    }

    if (isRendered()) return;

    const chartTheme = darkMode.value ? 'dark' : 'light';

    chart.value = echarts.init(element, chartTheme);

    chart.value.setOption(SMOOTH_DEFAULTS);
    chart.value?.setOption({ ...chartOptions, backgroundColor: 'transparent' });
    // as in Grafana: a double click puts the zoom back to the whole range
    chart.value.getZr().on('dblclick', () => {
      chart.value?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    });

    await onRender?.(chart.value!);
  }

  /** resize chart */
  function resize() {
    chart.value?.resize();
  }

  /** destroy chart */
  async function destroy() {
    if (!chart.value) return;

    await onDestroy?.(chart.value);
    if (!chart.value.isDisposed()) chart.value.dispose();
    chart.value = null;
  }

  /** change chart theme */
  async function changeTheme() {
    await destroy();
    await render();
    await onUpdated?.(chart.value!);
  }

  /**
   * render chart by size
   *
   * @param w width
   * @param h height
   */
  async function renderChartBySize(w: number, h: number) {
    initialSize.width = w;
    initialSize.height = h;

    if (!domRef.value || w <= 0 || h <= 0) return;

    // resize chart
    if (isRendered()) {
      resize();

      return;
    }

    // render chart
    await render();

    if (chart.value) {
      await onUpdated?.(chart.value);
    }
  }

  scope.run(() => {
    watch(
      [width, height],
      ([newWidth, newHeight]) => {
        renderChartBySize(newWidth, newHeight);
      },
      { flush: 'post' }
    );

    watch(darkMode, () => {
      changeTheme();
    });
  });

  onScopeDispose(() => {
    destroy();
    scope.stop();
  });

  return {
    domRef,
    chart,
    updateOptions,
    setOptions,
    resize
  };
}
