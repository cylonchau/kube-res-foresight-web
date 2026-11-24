/**
 * The HTML an answer of the AI analysis may contain: tables, lists, headings, emphasis and a few level classes, and nothing else. The text is cut into tags and
 * text; a tag that is not on the list is dropped, a tag on the list is written again without any attribute but the colspan and rowspan of a cell and a level
 * class from a fixed list, and the text is escaped. There is no script, no style, no event handler, no link and no image in the output, whatever the model wrote.
 */
const TAGS = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'code',
  'h3',
  'h4',
  'h5',
  'br',
  'span',
  'div'
]);
/** the elements whose content is dropped together with the element */
const DROPPED = /<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?(<\/\1\s*>|$)/gi;
/** the classes an answer may use to grade a row or a figure */
export const LEVEL_CLASSES = ['lv-bad', 'lv-warn', 'lv-ok', 'lv-info'] as const;
/** the classes of a formula the answer writes: a block of lines (fx), a coefficient (fx-c), a name (fx-n) and a result (fx-r) */
export const FORMULA_CLASSES = ['fx', 'fx-c', 'fx-n', 'fx-r'] as const;

const escapeText = (text: string) =>
  text
    .replace(/&(?!(?:amp|lt|gt|quot|#39|nbsp);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function attributes(name: string, raw: string) {
  const out: string[] = [];
  if (name === 'td' || name === 'th') {
    for (const key of ['colspan', 'rowspan']) {
      const match = new RegExp(`\\b${key}\\s*=\\s*["']?(\\d{1,2})["']?`, 'i').exec(raw);
      if (match) out.push(`${key}="${match[1]}"`);
    }
  }
  const cls = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(raw);
  const levels = (cls?.[1] ?? cls?.[2] ?? '')
    .split(/\s+/)
    .filter(
      item =>
        (LEVEL_CLASSES as readonly string[]).includes(item) || (FORMULA_CLASSES as readonly string[]).includes(item)
    );
  if (levels.length) out.push(`class="${levels.join(' ')}"`);
  return out.length ? ` ${out.join(' ')}` : '';
}

/** whether the text carries any HTML tag of the list: an answer in Markdown has none */
export function looksLikeHtml(source: string): boolean {
  return /<\/?(table|thead|tbody|tr|th|td|p|ul|ol|li|h3|h4|h5|div|span|strong|b|em|i|code)\b[^>]*>/i.test(source);
}

/** the answer as safe HTML: the fences a model puts around it are taken off, then the tags and the text are made as described above */
export function sanitizeAnswerHtml(source: string): string {
  const text = source
    .replace(/^\s*```(?:html)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .replace(DROPPED, '');
  const out: string[] = [];
  let last = 0;
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  for (let match = tag.exec(text); match; match = tag.exec(text)) {
    out.push(escapeText(text.slice(last, match.index)));
    last = match.index + match[0].length;
    const name = match[2].toLowerCase();
    if (!TAGS.has(name)) continue;
    if (match[1]) out.push(`</${name}>`);
    else if (name === 'br') out.push('<br>');
    else out.push(`<${name}${attributes(name, match[3])}>`);
  }
  out.push(escapeText(text.slice(last)));
  return out.join('');
}
