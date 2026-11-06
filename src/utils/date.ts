function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * The platform shows every time in UTC+8, whatever zone the browser is in: the logs, the history and the schedules are all read in
 * one zone, so a time seen here is the time written in a log line. The API sends instants (with their offset), so a time is converted
 * once, here, on its way to the eye.
 */
export const DISPLAY_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Format an API timestamp as UTC+8 wall-clock time without locale-dependent punctuation. */
export function formatDateTime(value?: string | number | Date | null, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const shifted = new Date(date.getTime() + DISPLAY_OFFSET_MS);
  return [
    `${shifted.getUTCFullYear()}-${padDatePart(shifted.getUTCMonth() + 1)}-${padDatePart(shifted.getUTCDate())}`,
    `${padDatePart(shifted.getUTCHours())}:${padDatePart(shifted.getUTCMinutes())}:${padDatePart(shifted.getUTCSeconds())}`
  ].join(' ');
}

/**
 * A date picker shows the fields of the browser's own zone. To make it show the UTC+8 wall clock of an instant, it is given the
 * timestamp whose browser-local fields are those of UTC+8 (the instant itself when the browser is in UTC+8).
 */
export function toPickerValue(instantMs: number) {
  return instantMs + DISPLAY_OFFSET_MS + new Date(instantMs).getTimezoneOffset() * 60 * 1000;
}

/** The instant a date picker's value stands for, read as UTC+8 wall clock. The inverse of toPickerValue. */
export function fromPickerValue(pickerMs: number) {
  return pickerMs - DISPLAY_OFFSET_MS - new Date(pickerMs).getTimezoneOffset() * 60 * 1000;
}

/** The label of a time axis: the UTC+8 clock, with the date where a new day starts. */
export function axisTimeLabel(value: number | string) {
  const text = formatDateTime(Number(value));
  const clock = text.slice(11, 16);
  return clock === '00:00' ? `${text.slice(5, 10)}\n${clock}` : clock;
}

/**
 * The label of a time axis that knows how long a stretch it shows: over a few days the ticks are days apart, so the date is the label (a bare
 * "06:00" on every tick says nothing); over one to three days it is the date over the clock; within a day the clock, with the date where a
 * new day starts.
 */
export function axisTimeLabelFor(value: number | string, spanMs: number) {
  const day = 24 * 3600 * 1000;
  if (spanMs > 3 * day) return formatDateTime(Number(value)).slice(5, 10);
  if (spanMs > day * 1.2) {
    const text = formatDateTime(Number(value));
    return `${text.slice(5, 10)}\n${text.slice(11, 16)}`;
  }
  return axisTimeLabel(value);
}

interface AxisParam {
  axisValue?: number | string;
  value?: unknown;
  marker?: unknown;
  seriesName?: string;
}

/** The tooltip of a time axis: the UTC+8 time as its header and one row per series that has a value there. */
export function axisTooltip(valueFormatter?: (value: unknown) => string) {
  return (params: unknown) => {
    const list = (Array.isArray(params) ? params : [params]) as AxisParam[];
    const first = list[0];
    const at = first?.axisValue ?? (Array.isArray(first?.value) ? first.value[0] : undefined);
    const rows = [`<b>${formatDateTime(Number(at))}</b>`];
    for (const item of list) {
      const raw = Array.isArray(item.value) ? item.value[1] : item.value;
      if (raw === null || raw === undefined) continue;
      rows.push(
        `${typeof item.marker === 'string' ? item.marker : ''}${item.seriesName ?? ''}: ${valueFormatter ? valueFormatter(raw) : String(raw)}`
      );
    }
    return rows.join('<br/>');
  };
}
