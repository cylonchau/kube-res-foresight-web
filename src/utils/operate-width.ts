/**
 * The width an operate column needs for its buttons, worked out from their labels instead of guessed per page: a button that
 * does not fit is cut off by the edge of the table (the column is pinned, so it cannot scroll into view).
 *
 * A tiny Naive UI button is its text plus 6px of padding on each side; a character of the 12px font is 12px wide when it is
 * wide (Chinese) and about 7px when it is Latin. The gap between buttons is the 6px of the page's NSpace, the cell adds 12px on
 * each side, and a few pixels are kept so that a screen with a different scale does not cut the last button.
 */
const BUTTON_PADDING = 12;
const CELL_PADDING = 24;
const SAFETY = 10;

function textWidth(label: string) {
  return [...label].reduce((width, char) => width + ((char.codePointAt(0) ?? 0) > 255 ? 12 : 7), 0);
}

export function operateWidth(labels: string[], gap = 6) {
  const buttons = labels.reduce((width, label) => width + textWidth(label) + BUTTON_PADDING, 0);
  return Math.ceil(buttons + gap * Math.max(labels.length - 1, 0) + CELL_PADDING + SAFETY);
}
