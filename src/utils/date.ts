function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

/** Format an API timestamp in the browser's local timezone without locale-dependent punctuation. */
export function formatDateTime(value?: string | number | Date | null, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return [
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`
  ].join(' ');
}
