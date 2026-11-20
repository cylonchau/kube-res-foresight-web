/**
 * The analysis window of the resource dashboard, chosen with the same time field as everywhere else (the last N minutes, hours or days, or a fixed range).
 * The platform stores the results of seven windows; any other length is analysed live over its own range.
 */
import type { RangeValue } from '../hooks/business/use-forecast-modules.ts';
import type { GrafanaRange } from './resource-links.ts';

const MINUTE = 60 * 1000;

// the three helpers of the time field, written here so that this file has no dependency but types (it is tested on its own)
function relativeRange(ms: number): RangeValue {
  const end = Date.now();
  return Object.assign([end - ms, end] as [number, number], { relativeMs: ms });
}
function resolveRange(range: RangeValue): [number, number] {
  if (range.relativeMs) {
    const end = Date.now();
    return [end - range.relativeMs, end];
  }
  return [range[0], range[1]];
}
function rangeParams(range: RangeValue) {
  const [from, to] = resolveRange(range);
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/** the windows the platform stores the results of, with their length in minutes */
export const STORED_WINDOWS: Array<{ label: string; minutes: number }> = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '1d', minutes: 24 * 60 },
  { label: '7d', minutes: 7 * 24 * 60 },
  { label: '15d', minutes: 15 * 24 * 60 },
  { label: '30d', minutes: 30 * 24 * 60 }
];

/** the longest range the analysis takes */
export const MAX_WINDOW_MINUTES = 30 * 24 * 60;

export const DEFAULT_WINDOW_LABEL = '7d';

/** the window of the last `label` ('7d', '1h' ...) as the time field holds it */
export function rangeOfLabel(label: string): RangeValue {
  const found = STORED_WINDOWS.find(item => item.label === label) ?? STORED_WINDOWS.find(item => item.label === '7d')!;
  return relativeRange(found.minutes * MINUTE);
}

export interface WindowChoice {
  /** the length in minutes */
  minutes: number;
  /** the parameters of a request: a stored window ({ window }) or a range ({ from, to }) */
  params: { window?: string; from?: string; to?: string };
  /** the same as the time range of Grafana */
  grafana: GrafanaRange;
  /** the stored window the overview reads: the shortest that covers the range, at most 30 days */
  board: string;
  /** whether the range is one of the stored windows exactly */
  stored: boolean;
  /** the hours the trends and the history of changes of the inventory go back */
  hours: number;
}

/** the Grafana window of a relative range of `minutes`: 7d, 3h, 90m */
function grafanaWindow(minutes: number) {
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

/** what a time range of the page means for the requests, for Grafana and for the overview */
export function windowOf(range: RangeValue | [number, number] | null | undefined): WindowChoice {
  const value = (range ?? rangeOfLabel(DEFAULT_WINDOW_LABEL)) as RangeValue;
  const relativeMs = value.relativeMs;
  const resolved = resolveRange(value);
  const span = Math.max(Math.round((resolved[1] - resolved[0]) / MINUTE), 1);
  const minutes = Math.min(span, MAX_WINDOW_MINUTES);
  const exact = relativeMs ? STORED_WINDOWS.find(item => item.minutes === Math.round(relativeMs / MINUTE)) : undefined;
  const board = (STORED_WINDOWS.find(item => item.minutes >= minutes) ?? STORED_WINDOWS[STORED_WINDOWS.length - 1])
    .label;
  const hours = Math.min(Math.max(Math.ceil(span / 60), 1), 24 * 365);
  if (exact)
    return { minutes, params: { window: exact.label }, grafana: { window: exact.label }, board, stored: true, hours };
  const params = rangeParams(value);
  return {
    minutes,
    params,
    grafana: relativeMs
      ? { window: grafanaWindow(Math.round(relativeMs / MINUTE)) }
      : { from: params.from, to: params.to },
    board,
    stored: false,
    hours
  };
}
