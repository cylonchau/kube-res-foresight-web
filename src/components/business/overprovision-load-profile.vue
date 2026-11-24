<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import IconTooltip from '@/components/common/icon-tooltip.vue';
import { formatPercent } from '@/utils/format';

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
      {{ worth ? p('profileWorth', { saved: formatPercent(profile.saved, 0), peak: profile.peak }) : p('profileFlat') }}
    </div>
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
