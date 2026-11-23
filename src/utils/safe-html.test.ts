import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeHtml, sanitizeAnswerHtml } from './safe-html.ts';

test('tables, lists and emphasis are kept, written again without attributes', () => {
  const html = sanitizeAnswerHtml(
    '<table class="x" style="color:red"><thead><tr><th>项</th></tr></thead><tbody><tr><td colspan="2" onclick="x()">CPU</td></tr></tbody></table>'
  );
  assert.equal(
    html,
    '<table><thead><tr><th>项</th></tr></thead><tbody><tr><td colspan="2">CPU</td></tr></tbody></table>'
  );
});

test('a level class is kept and any other class is not', () => {
  assert.equal(sanitizeAnswerHtml('<td class="lv-bad evil">高</td>'), '<td class="lv-bad">高</td>');
  assert.equal(sanitizeAnswerHtml('<span class="evil">x</span>'), '<span>x</span>');
});

test('scripts, styles, links, images and handlers never come out', () => {
  const html = sanitizeAnswerHtml(
    '<p>a</p><script>alert(1)</script><style>p{}</style><a href="javascript:x()">l</a><img src=x onerror=alert(1)><iframe src="x"></iframe>'
  );
  assert.equal(html, '<p>a</p>l');
  assert.ok(!/script|onerror|href|<img|<a /i.test(html));
});

test('text is escaped, and a stray bracket cannot open an element', () => {
  assert.equal(sanitizeAnswerHtml('1 < 2 & 3 > 2'), '1 &lt; 2 &amp; 3 &gt; 2');
  assert.equal(sanitizeAnswerHtml('<p>&amp; ok</p>'), '<p>&amp; ok</p>');
});

test('the fence a model writes around its answer is taken off', () => {
  assert.equal(sanitizeAnswerHtml('```html\n<p>a</p>\n```'), '<p>a</p>');
});

test('HTML is told from Markdown', () => {
  assert.equal(looksLikeHtml('<table><tr><td>1</td></tr></table>'), true);
  assert.equal(looksLikeHtml('| a | b |\n|---|---|\n| 1 | 2 |'), false);
});
