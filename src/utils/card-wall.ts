/**
 * The layout of a wall of cards of one size: how many columns, and how wide each card is, so that no place is left empty.
 *
 * `fit` is how many columns the width has room for. The columns are the ones, from half of the room up to all of it, that leave the fewest empty places in the
 * last row (the more columns when the same), and the cards of a last row that is not full take the places that are left: a row of three cards in five
 * columns is cards of two, two and one.
 */
export function cardColumns(count: number, fit: number): number {
  const room = Math.max(1, Math.min(fit, count));
  if (count <= 1 || room === 1) return 1;
  let best = room;
  let bestEmpty = Number.POSITIVE_INFINITY;
  for (let columns = room; columns >= Math.max(1, Math.ceil(room / 2)); columns -= 1) {
    const empty = (columns - (count % columns)) % columns;
    if (empty < bestEmpty) {
      best = columns;
      bestEmpty = empty;
    }
  }
  return best;
}

/** the number of columns each card takes: one, except in a last row that is not full */
export function cardSpans(count: number, columns: number): number[] {
  const spans = Array.from({ length: count }, () => 1);
  const last = count % columns;
  if (last === 0 || columns <= 1) return spans;
  const base = Math.floor(columns / last);
  const extra = columns % last;
  for (let i = 0; i < last; i += 1) spans[count - last + i] = base + (i < extra ? 1 : 0);
  return spans;
}
