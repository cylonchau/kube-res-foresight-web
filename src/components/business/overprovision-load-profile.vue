<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { formatBytes, formatCores, formatPercent } from '@/utils/format';

defineOptions({ name: 'OverprovisionLoadProfile' });

/**
 * The normal part and the busy part of the day: the replicas each hour of the day asks for at the P95 of its own use (over every day of the period), which hours are above
 * the count the typical hour asks for, for how much of the time the use is above what that count carries, and what a count that follows the hours would save over one that
 * stays at the busiest hour's. One row of 24 bars: the height is the replicas, the busy hours are marked.
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
const bars = computed(() =>
  props.profile.hours.map(h => ({
    hour: h.hour,
    need: h.need,
    height: props.profile.peak > 0 ? Math.max((h.need / props.profile.peak) * 100, 4) : 4,
    busy: h.need > props.profile.normal,
    title: p('profileHourTitle', { hour: hourText(h.hour), need: h.need, cpu: h.cpu || '-', memory: h.memory || '-' })
  }))
);

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
  columns: number;
  hours: LoadHour[];
}

const figure = (resource: string, value: number) =>
  resource === 'memory' ? formatBytes(value, 2) : formatCores(value, 2);
const two = (n: number) => String(n).padStart(2, '0');
/** a cell under what the normal count carries is blue, the deeper the closer to it; over it is orange to red; no data is grey */
function cellColor(ratio: number): string {
  if (ratio < 0) return 'rgba(128,128,128,0.15)';
  if (ratio > 1)
    return `rgba(240, ${Math.round(150 - Math.min(ratio - 1, 1) * 90)}, 40, ${0.6 + Math.min(ratio - 1, 1) * 0.4})`;
  return `rgba(32,128,240,${0.12 + 0.6 * ratio})`;
}

const loadRows = computed<LoadRow[]>(() => {
  const prof = props.profile;
  const cellSeconds = prof.cell_seconds ?? 0;
  if (!prof.recent?.length || !cellSeconds || !prof.recent_hours?.length) return [];
  const perHour = Math.max(Math.floor(3600 / cellSeconds), 1);
  return prof.recent.map(load => {
    const hours: LoadHour[] = prof.recent_hours!.map((hour, h) => {
      const cells: LoadCell[] = [];
      let sum = 0;
      let count = 0;
      let high = 0;
      for (let c = 0; c < perHour; c += 1) {
        const value = load.values[h * perHour + c] ?? -1;
        const ratio = value < 0 || !(load.capacity > 0) ? -1 : value / load.capacity;
        const at = `${two(hour)}:${two(Math.floor((c * cellSeconds) / 60))}`;
        const isHigh = ratio > 1;
        if (value >= 0) {
          sum += ratio;
          count += 1;
        }
        if (isHigh) high += 1;
        cells.push({
          key: `${h}-${c}`,
          style: { background: cellColor(ratio) },
          high: isHigh,
          title:
            value < 0
              ? p('profileCellNone', { at })
              : p('profileCellTitle', {
                  at,
                  use: figure(load.resource, value),
                  share: formatPercent(ratio, 0),
                  level: isHigh ? p('profileHigh') : p('profileNormal')
                })
        });
      }
      const mean = count ? sum / count : -1;
      return {
        hour,
        high,
        cells,
        style: {
          background: cellColor(mean).replace(/[\d.]+\)$/, '0.18)'),
          borderColor: high ? 'rgb(240,140,40)' : 'transparent'
        }
      };
    });
    return {
      resource: load.resource,
      name: p(load.resource === 'memory' ? 'sectionMemory' : 'sectionCpu'),
      capacity: figure(load.resource, load.capacity),
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

    <!-- the replicas each hour of the day asks for -->
    <section class="area">
      <div class="area-title">{{ p('profileReplicasTitle') }}</div>
      <div class="bars">
        <div v-for="bar in bars" :key="bar.hour" class="bar-col" :title="bar.title">
          <div class="bar" :class="{ busy: bar.busy }" :style="{ height: `${bar.height}%` }"></div>
          <div class="bar-label">{{ bar.hour % 3 === 0 ? String(bar.hour).padStart(2, '0') : '' }}</div>
        </div>
      </div>
      <div class="text-12px">
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
        <span class="swatch" :style="{ background: 'rgba(32,128,240,0.4)' }"></span>
        {{ p('profileNormal') }}
        <span class="swatch" :style="{ background: 'rgba(240,120,40,0.85)' }"></span>
        {{ p('profileHigh') }}
        <span class="swatch" :style="{ background: 'rgba(128,128,128,0.25)' }"></span>
        {{ p('profileNoData') }}
      </div>
      <div v-for="row in loadRows" :key="row.resource" class="load-row">
        <div class="load-name">
          <b>{{ row.name }}</b>
          <span class="opacity-70">{{ p('profileCapacity', { n: profile.normal, v: row.capacity }) }}</span>
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
  height: 64px;
}

.bar-col {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;
}

.bar {
  background: rgba(32, 128, 240, 0.35);
  border-radius: 2px 2px 0 0;
}

.bar.busy {
  background: rgba(240, 160, 32, 0.8);
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
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 3px;
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
