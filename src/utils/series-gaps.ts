/**
 * Where a series has no values for a stretch of time the line must break there, not run straight across it: a line drawn
 * over a six hour hole says the value was known all along. A gap is a distance between two neighbouring points of more than
 * `GAP_FACTOR` buckets (a bucket is one step of the chart; a little jitter in the sampling is not a gap).
 */
export const GAP_FACTOR = 2.5;

export type TimedPoint = [number, number | null];

/** the longest distance in ms between two neighbouring points that is still one line */
export function gapLimit(bucketSeconds: number): number {
  return Math.max(bucketSeconds, 1) * 1000 * GAP_FACTOR;
}

/** how many times a time-ordered list of timestamps (ms) jumps over more than the limit */
export function countGaps(times: number[], bucketSeconds: number): number {
  const limit = gapLimit(bucketSeconds);
  let gaps = 0;
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] > limit) gaps += 1;
  }
  return gaps;
}

/**
 * The points with a null point put into every gap, so the chart (which does not connect nulls) leaves the gap open. The
 * break sits one bucket after the point before it. The input must be ordered by time; it is not modified.
 */
export function withBreaks<T>(
  points: T[],
  bucketSeconds: number,
  timeOf: (point: T) => number,
  make: (point: T) => unknown,
  breakAt: (time: number) => unknown
): unknown[] {
  const limit = gapLimit(bucketSeconds);
  const out: unknown[] = [];
  points.forEach((point, index) => {
    if (index > 0 && timeOf(point) - timeOf(points[index - 1]) > limit) {
      out.push(breakAt(timeOf(points[index - 1]) + Math.max(bucketSeconds, 1) * 1000));
    }
    out.push(make(point));
  });
  return out;
}

/**
 * The gaps of a series as pairs of the last point before and the first point after it. A line drawn between them is not data:
 * it only shows where the series is missing, in another line style, and the chart says so. The input must be ordered by time.
 */
export function gapPairs<T>(
  points: T[],
  bucketSeconds: number,
  timeOf: (point: T) => number,
  valueOf: (point: T) => number
): Array<{ from: [number, number]; to: [number, number] }> {
  const limit = gapLimit(bucketSeconds);
  const out: Array<{ from: [number, number]; to: [number, number] }> = [];
  for (let i = 1; i < points.length; i += 1) {
    if (timeOf(points[i]) - timeOf(points[i - 1]) > limit) {
      out.push({
        from: [timeOf(points[i - 1]), valueOf(points[i - 1])],
        to: [timeOf(points[i]), valueOf(points[i])]
      });
    }
  }
  return out;
}
