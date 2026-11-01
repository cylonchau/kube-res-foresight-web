/**
 * The few Markdown forms an answer of the assistant uses (headings, lists, bold, inline code, code blocks, tables), as HTML that is safe to
 * insert. The text is escaped first and only then marked up, so nothing the model wrote, or a tool returned and the model repeated,
 * can become an element, an attribute or a link: there is no raw HTML and no link at all in the output.
 */
function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** bold and inline code inside one line of already escaped text */
function inline(escaped: string) {
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line: string) => /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/.test(line) && line.includes('-');
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(cell => cell.trim());

export function renderMiniMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      closeList();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      closeList();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      i -= 1;
      html.push(
        `<table><thead><tr>${head.map(c => `<th>${inline(escapeHtml(c))}</th>`).join('')}</tr></thead><tbody>${rows
          .map(r => `<tr>${head.map((_, k) => `<td>${inline(escapeHtml(r[k] ?? ''))}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      html.push(`<p class="md-h">${inline(escapeHtml(heading[2]))}</p>`);
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        html.push(`<${kind}>`);
        list = kind;
      }
      html.push(`<li>${inline(escapeHtml((bullet ?? numbered)![1]))}</li>`);
      continue;
    }

    closeList();
    if (line.trim() === '') continue;
    html.push(`<p>${inline(escapeHtml(line))}</p>`);
  }
  closeList();
  return html.join('');
}
