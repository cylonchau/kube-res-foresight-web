export interface MetricResult {
  def: Api.Forecast.MetricDef;
  result: Api.Forecast.MetricQueryResult;
  /** the measured series drawn dashed over a forecast */
  actual?: boolean;
}

export interface SummaryRow {
  key: string;
  name: string;
  points: number;
  last: number;
  min: number;
  max: number;
  mean: number;
}

/** The name a series is shown under: its labels, the measured marker, or the metric's own description. */
export function seriesName(
  def: Api.Forecast.MetricDef,
  labels: Record<string, string>,
  actual: boolean | undefined,
  actualLabel: string,
  helpText: string
) {
  if (actual) return actualLabel;
  const parts = Object.values(labels);
  return parts.length ? parts.join(' / ') : helpText;
}

/** One row per series with points: count, last, min, max and mean. It summarizes what the server already aggregated. */
export function summarize(
  results: MetricResult[],
  name: (item: MetricResult, labels: Record<string, string>) => string
) {
  return results.flatMap(item =>
    item.result.series
      .filter(series => series.points.length)
      .map<SummaryRow>(series => {
        const values = series.points.map(point => point.value);
        return {
          key: `${item.def.name}:${JSON.stringify(series.labels)}`,
          name: name(item, series.labels),
          points: values.length,
          last: values[values.length - 1],
          min: Math.min(...values),
          max: Math.max(...values),
          mean: values.reduce((a, b) => a + b, 0) / values.length
        };
      })
  );
}

/** Downloads every point of the results as CSV. Names are quoted so a label can hold a comma. */
export function downloadSeriesCsv(
  results: MetricResult[],
  fileName: string,
  name: (item: MetricResult, labels: Record<string, string>) => string
) {
  const lines = ['metric,series,time,value'];
  for (const item of results) {
    for (const series of item.result.series) {
      const quoted = name(item, series.labels).replaceAll('"', '""');
      for (const point of series.points) {
        lines.push(`${item.def.name},"${quoted}",${new Date(point.ts * 1000).toISOString()},${point.value}`);
      }
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = `kube-resource-fcst-${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export const formatNumber = (value: number) => (Number.isFinite(value) ? Number(value.toPrecision(5)).toString() : '-');
