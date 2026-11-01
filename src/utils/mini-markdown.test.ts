import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMiniMarkdown } from './mini-markdown.ts';

test('nothing a model writes becomes an element, an attribute or a link', () => {
  const html = renderMiniMarkdown(
    '<img src=x onerror=alert(1)> [click](javascript:alert(1)) <script>alert(1)</script> "quoted" \'single\''
  );
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<a '));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&quot;quoted&quot;'));
});

test('bold, inline code, headings and lists', () => {
  assert.equal(
    renderMiniMarkdown('**3** modules need `attention`'),
    '<p><strong>3</strong> modules need <code>attention</code></p>'
  );
  assert.equal(renderMiniMarkdown('## Status'), '<p class="md-h">Status</p>');
  assert.equal(
    renderMiniMarkdown('- a\n- b\n\n1. one\n2) two'),
    '<ul><li>a</li><li>b</li></ul><ol><li>one</li><li>two</li></ol>'
  );
});

test('a table keeps its cells, escaped, and a row with a missing cell does not break it', () => {
  const html = renderMiniMarkdown('| module | state |\n|---|---|\n| shop | <b>x</b> |\n| api |');
  assert.ok(html.startsWith('<table><thead><tr><th>module</th><th>state</th></tr></thead>'));
  assert.ok(html.includes('<td>shop</td><td>&lt;b&gt;x&lt;/b&gt;</td>'));
  assert.ok(html.includes('<td>api</td><td></td>'));
});

test('a code block is shown as it is, escaped, and markup inside it is not applied', () => {
  assert.equal(renderMiniMarkdown('```\n<a> **b**\n```'), '<pre><code>&lt;a&gt; **b**</code></pre>');
  // an unclosed block runs to the end instead of swallowing the page
  assert.equal(renderMiniMarkdown('```\nx'), '<pre><code>x</code></pre>');
});

test('empty text is empty html', () => {
  assert.equal(renderMiniMarkdown(''), '');
  assert.equal(renderMiniMarkdown('\n\n'), '');
});
