<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { formatBytes, formatCores, formatPercent } from '@/utils/format';
import { LOAD_COLORS, barPercent, capacityParts, loadColor } from '@/utils/load-profile';

defineOptions({ name: 'OverprovisionLoadProfile' });

/**
 * The normal part and the busy part of the day, all of it counted on the Requests of one Pod: the replicas each hour of the day asks for at the P95 of its own use (over every day of
 * the period), which hours are above the count the typical hour asks for, for how much of the time the use is above what that count carries, and what a count that follows the hours
 * would save over one that stays at the busiest hour's. One row of 24 bars: the height is the replicas from zero (the busiest hour is the full height), green for the normal hours
 * and orange for the busy ones, with the figure on each bar; below it the use itself over the last 24 hours, every cell coloured by its share of what the normal replicas carry.
 */
interface Props {
  profile: Api.Overprovision.LoadProfile;
}
const props = defineProps<Props>();
const { t } = useI18n();
const p = (key: string, named?: Record<string, unknown>) => t(`page.overprovision.${key}`, named ?? {});

const hourText = (h: number) => `${String(h).padStart(2, '0')}:00`;
/** the stretches of the busy hours, so "09:00, 10:00, 11:00" reads "09:00-12:00" */
const peakRanges = computed(() => {
  const hours = [...props.profile.peak_hours].sort((a, b) => a - b);
  const out: string[] = [];
  let start = -1;
  let prev = -1;
  const close = () => {
    if (start >= 0) out.push(start === prev ? hourText(start) : `${hourText(start)}-${hourText(prev + 1)}`);
  };
  for (const h of hours) {
    if (start >= 0 && h === prev + 1) {
      prev = h;
    } else {
      close();
      start = h;
      prev = h;
    }
  }
  close();
  return out.join('、');
});
const busy = computed(() => props.profile.peak_hours.length > 0 && props.profile.peak > props.profile.normal);
const worth = computed(() => busy.value && props.profile.saved >= 0.05);
/** the replicas the workload really had are measured (the replicas metric of the module); when there is none, the bars are not drawn and nothing takes their place */
const hasActual = computed(() => (props.profile.actual_hours ?? 0) > 0);
/** bars and ticks share one scale from zero: the larger of the measured peak and the estimated one */
const scaleMax = computed(() => Math.max(props.profile.actual_peak ?? 0, props.profile.peak, 1));
const bars = computed(() =>
  props.profile.hours.map(h => {
    const actual = h.actual ?? 0;
    const estimate = { hour: hourText(h.hour), need: h.need, cpu: h.cpu || '-', memory: h.memory || '-' };
    return {
      hour: h.hour,
      actual,
      need: h.need,
      height: barPercent(actual, scaleMax.value),
      needHeight: barPercent(h.need, scaleMax.value),
      // the colour says how the use of the hour compares with the normal hour; it is not the length of the bar
      busy: h.need > props.profile.normal,
      title:
        actual > 0
          ? p('profileHourTitleActual', {
              ...estimate,
              actual,
              min: h.actual_min ?? actual,
              max: h.actual_max ?? actual,
              samples: h.actual_samples ?? 0
            })
          : p('profileHourTitleNoActual', estimate)
    };
  })
);
/** the measured replicas of each of the last 24 hours, written under the blocks of the use */
const recentReplicas = computed(() => props.profile.recent_replicas ?? []);
const hasRecentReplicas = computed(() => recentReplicas.value.some(n => n > 0));

// ---- the use itself over the last 24 hours: 24 blocks (one for each hour), each cut into cells of 5 or 10 minutes

interface LoadCell {
  key: string;
  style: Record<string, string>;
  title: string;
  high: boolean;
}
interface LoadHour {
  hour: number;
  style: Record<string, string>;
  high: number;
  cells: LoadCell[];
}
interface LoadRow {
  resource: 'cpu' | 'memory';
  name: string;
  capacity: string;
  /** what the capacity is made of, written out: the normal count x the Requests of one Pod x the target */
  formula: string;
  columns: number;
  hours: LoadHour[];
}

const figure = (resource: string, value: number) =>
  resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 2);
const two = (n: number) => String(n).padStart(2, '0');

const loadRows = computed<LoadRow[]>(() => {
  const prof = props.profile;
  const cellSeconds = prof.cell_seconds ?? 0;
  if (!prof.recent?.length || !cellSeconds || !prof.recent_hours?.length) return [];
  const perHour = Math.max(Math.floor(3600 / cellSeconds), 1);
  return prof.recent.map(load => {
    const parts = capacityParts(load.capacity, prof.normal, prof.target);
    const capacityText = figure(load.resource, load.capacity);
    const hours: LoadHour[] = prof.recent_hours!.map((hour, h) => {
      const cells: LoadCell[] = [];
      let high = 0;
      for (let c = 0; c < perHour; c += 1) {
        const value = load.values[h * perHour + c] ?? -1;
        const ratio = value < 0 || !(load.capacity > 0) ? -1 : value / load.capacity;
        const at = `${two(hour)}:${two(Math.floor((c * cellSeconds) / 60))}`;
        const isHigh = ratio > 1;
        if (isHigh) high += 1;
        cells.push({
          key: `${h}-${c}`,
          style: { background: loadColor(ratio) },
          high: isHigh,
          title:
            value < 0
              ? p('profileCellNone', { at })
              : p('profileCellTitle', {
                  at,
                  use: figure(load.resource, value),
                  capacity: capacityText,
                  share: formatPercent(ratio, 0),
                  level: isHigh ? p('profileHigh') : p('profileNormal')
                })
        });
      }
      return {
        hour,
        high,
        cells,
        // the block of an hour with a high load is outlined in orange and its cells sit inside, apart from the line by a neutral margin: the cells are the same colours as the line, so
        // without the margin they run into it and the outline cannot be told from them
        style: {
          background: 'rgba(128, 128, 128, 0.10)',
          borderColor: high ? 'rgb(240, 140, 40)' : 'transparent'
        }
      };
    });
    return {
      resource: load.resource,
      name: p(load.resource === 'memory' ? 'sectionMemory' : 'sectionCpu'),
      capacity: capacityText,
      formula: parts
        ? p('profileCapacityFormula', {
            n: parts.normal,
            request: figure(load.resource, parts.request),
            target: formatPercent(parts.target, 0),
            v: capacityText
          })
        : p('profileCapacity', { n: prof.normal, v: capacityText }),
      columns: Math.min(perHour, 6),
      hours
    };
  });
});
const cellMinutes = computed(() => Math.round((props.profile.cell_seconds ?? 0) / 60));

const resourceName = computed(() => p(props.profile.resource === 'memory' ? 'sectionMemory' : 'sectionCpu'));
</script>

<template>
  <div class="plan-card">
    <div class="plan-head">
      <span class="font-medium">{{ p('profileTitle') }}</span>
      <IconTooltip placement="top">
        <div class="help-pop">
          {{ p('profileHelp', { pct: profile.percentile, target: formatPercent(profile.target, 0) }) }}
        </div>
      </IconTooltip>
      <span class="plan-note">{{ p('profileNote', { days: profile.days }) }}</span>
    </div>

    <!-- the replicas each hour of the day really had (measured), and beside them the replicas the use of that hour asks for (an estimate, marked apart) -->
    <section class="area">
      <div class="area-title">
        {{ p('profileReplicasTitle') }}
        <IconTooltip placement="top">
          <div class="help-pop">
            <div>{{ p('profileActualBasis', { source: profile.actual_source || p('profileActualSourceNone') }) }}</div>
            <div>
              {{
                p('profileNeedBasis', {
                  pct: profile.percentile,
                  target: formatPercent(profile.target, 0)
                })
              }}
            </div>
            <div>{{ p('profileColourBasis') }}</div>
          </div>
        </IconTooltip>
        <span class="plan-note">{{ p('profileActualNote') }}</span>
      </div>
      <div v-if="!hasActual" class="no-actual text-12px">{{ p('profileNoActual') }}</div>
      <div class="bars">
        <div v-for="bar in bars" :key="bar.hour" class="bar-col" :title="bar.title">
          <div class="bar-track">
            <div class="bar-figure" :class="{ busy: bar.busy }">{{ bar.actual > 0 ? bar.actual : '-' }}</div>
            <div
              class="bar"
              :class="{ busy: bar.busy }"
              :style="{ height: `calc((100% - 12px) * ${bar.height / 100})` }"
            ></div>
            <span
              v-if="bar.need > 0"
              class="need-tick"
              :style="{ bottom: `calc((100% - 12px) * ${bar.needHeight / 100})` }"
            ></span>
          </div>
          <div class="bar-label">{{ bar.hour % 3 === 0 ? String(bar.hour).padStart(2, '0') : '' }}</div>
        </div>
      </div>
      <div class="legend text-12px">
        <span class="swatch first" :style="{ background: LOAD_COLORS.normal }"></span>
        {{ p('profileBarNormal') }}
        <span class="swatch" :style="{ background: LOAD_COLORS.high }"></span>
        {{ p('profileBarBusy') }}
        <span class="tick-swatch"></span>
        {{ p('profileTickLegend') }}
      </div>
      <div v-if="hasActual" class="text-12px">
        {{
          p('profileActualSummary', {
            normal: profile.actual_normal ?? 0,
            peak: profile.actual_peak ?? 0,
            hours: profile.actual_hours ?? 0,
            samples: profile.actual_samples ?? 0,
            source: profile.actual_source || p('profileActualSourceNone')
          })
        }}
      </div>
      <div class="text-12px opacity-80">
        {{ p('profileSummary', { normal: profile.normal, peak: profile.peak }) }}
        <template v-if="busy">{{ p('profilePeakHours', { hours: peakRanges }) }}</template>
      </div>
      <div v-if="profile.above && profile.above.share > 0" class="text-12px opacity-80">
        {{
          p('profileAbove', {
            r: resourceName,
            normal: profile.normal,
            share: formatPercent(profile.above.share, 1),
            events: profile.above.events,
            longest: profile.above.longest_minutes
          })
        }}
      </div>
      <div class="text-12px" :class="worth ? 'text-primary' : 'opacity-80'">
        {{
          worth ? p('profileWorth', { saved: formatPercent(profile.saved, 0), peak: profile.peak }) : p('profileFlat')
        }}
      </div>
    </section>

    <!-- the use itself over the last 24 hours: a block for each hour, a cell for each 5 or 10 minutes -->
    <section v-if="loadRows.length" class="area">
      <div class="area-title">
        {{ p('profileLoadTitle') }}
        <IconTooltip placement="top">
          <div class="help-pop">{{ p('profileLoadHelp') }}</div>
        </IconTooltip>
        <span class="plan-note">{{ p('profileLoadNote', { m: cellMinutes }) }}</span>
      </div>
      <div class="legend text-12px">
        <span class="swatch first" :style="{ background: LOAD_COLORS.normal }"></span>
        {{ p('profileNormal') }}
        <span class="swatch" :style="{ background: LOAD_COLORS.high }"></span>
        {{ p('profileHigh') }}
        <span class="swatch" :style="{ background: LOAD_COLORS.none }"></span>
        {{ p('profileNoData') }}
      </div>
      <div class="text-12px opacity-80">{{ p('profileLoadMeaning', { m: cellMinutes }) }}</div>
      <div v-for="row in loadRows" :key="row.resource" class="load-row">
        <div class="load-name">
          <b>{{ row.name }}</b>
          <span class="opacity-70">{{ row.formula }}</span>
        </div>
        <div class="hours">
          <div v-for="hour in row.hours" :key="hour.hour" class="hour" :style="hour.style">
            <div class="cells" :style="{ gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))` }">
              <span
                v-for="cell in hour.cells"
                :key="cell.key"
                class="cell"
                :style="cell.style"
                :title="cell.title"
              ></span>
            </div>
          </div>
        </div>
      </div>
      <div class="hours labels">
        <div v-for="(h, i) in profile.recent_hours" :key="i" class="hour-label">{{ String(h).padStart(2, '0') }}</div>
      </div>
      <div v-if="hasRecentReplicas" class="rep-line">
        <div class="load-name">
          <b>{{ p('profileRecentReplicas') }}</b>
          <span class="opacity-70">{{ p('profileRecentReplicasNote', { source: profile.actual_source || '-' }) }}</span>
        </div>
        <div class="hours">
          <div v-for="(n, i) in recentReplicas" :key="i" class="hour-label rep-figure">{{ n > 0 ? n : '-' }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.plan-card {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
}

.plan-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
}

.plan-note {
  font-size: 12px;
  line-height: 18px;
  opacity: 0.75;
}

.bars {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 3px;
  align-items: end;
  height: 96px;
}

.bar-track {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.4);
}

.bar-col {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;
}

.bar {
  min-height: 1px;
  background: rgb(24, 160, 88);
  border-radius: 2px 2px 0 0;
}

.bar.busy {
  background: rgb(240, 140, 40);
}

.bar-track {
  position: relative;
}

/* the replicas the use asks for: a dark dash across the column at that height, on the same scale as the bar, so the two are told apart and neither stands in for the other */
.need-tick {
  position: absolute;
  right: -1px;
  left: -1px;
  height: 0;
  pointer-events: none;
  border-top: 2px solid #2080f0;
}

.tick-swatch {
  display: inline-block;
  width: 14px;
  height: 0;
  margin-left: 8px;
  border-top: 2px solid #2080f0;
}

.no-actual {
  padding: 4px 8px;
  line-height: 18px;
  border-left: 3px solid rgb(240, 160, 32);
  background: rgba(240, 160, 32, 0.08);
}

.rep-line {
  display: grid;
  gap: 2px;
}

.rep-figure {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.85;
}

.bar-figure {
  font-size: 10px;
  line-height: 12px;
  text-align: center;
  opacity: 0.75;
}

.bar-figure.busy {
  font-weight: 600;
  opacity: 1;
}

.area {
  display: grid;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(128, 128, 128, 0.3);
}

.area-title {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  align-items: center;
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-left: 8px;
  border-radius: 2px;
}

.swatch.first {
  margin-left: 0;
}

.load-row {
  display: grid;
  gap: 2px;
}

.load-name {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
}

.hours {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 3px;
}

.hour {
  padding: 3px;
  border: 2px solid transparent;
  border-radius: 4px;
}

.cells {
  display: grid;
  gap: 1px;
}

.cell {
  display: block;
  height: 14px;
  border-radius: 1px;
}

.hour-label {
  font-size: 10px;
  text-align: center;
  opacity: 0.6;
}

.bar-label {
  height: 12px;
  font-size: 10px;
  line-height: 12px;
  text-align: center;
  opacity: 0.6;
}

.help-pop {
  max-width: 360px;
}
</style>
