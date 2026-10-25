import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createI18n } from 'vue-i18n';
import zh from './langs/zh-cn.ts';
import en from './langs/en-us.ts';

// Run with: node --test src/locales/locales.test.ts
// vue-i18n compiles a message when a page shows it, and a brace that is not a placeholder (a JSON example in a hint) throws
// "SyntaxError: <code>" and breaks the page. A brace in a message has to open a placeholder ({name}, {0}, {'literal'}), so a message that
// needs a literal one writes {'{'} or keeps the example in the code instead of the locale file.
const PLACEHOLDER = /^\{\s*(?:[\w.]+|'[^']*')\s*\}/;

function leaves(value: unknown, path: string, out: Array<[string, string]>) {
  if (typeof value === 'string') out.push([path, value]);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) leaves(child, path ? `${path}.${key}` : key, out);
  }
}

for (const [name, messages] of [
  ['zh-cn', zh],
  ['en-us', en]
] as const) {
  test(`no message of ${name} has a brace that is not a placeholder`, () => {
    const all: Array<[string, string]> = [];
    leaves(messages, '', all);
    assert.ok(all.length > 100);
    const broken: string[] = [];
    for (const [path, text] of all) {
      // walk the message: a brace has to open a placeholder, and the whole placeholder is skipped (it may hold a quoted brace)
      for (let i = 0; i < text.length; i += 1) {
        if (text[i] !== '{') continue;
        const match = PLACEHOLDER.exec(text.slice(i));
        if (match) i += match[0].length - 1;
        else broken.push(`${path}: ...${text.slice(Math.max(0, i - 8), i + 20)}...`);
      }
    }
    assert.deepEqual(broken, []);
  });
}

// The check above is a shortcut; this one runs the message compiler of vue-i18n itself over every message, so any other syntax
// it rejects (a linked-message marker such as an @ in a hint, an unbalanced pipe) fails here and not as a blank page.
for (const [name, locale] of [
  ['zh-cn', 'zh-CN'],
  ['en-us', 'en-US']
] as const) {
  test(`every message of ${name} compiles`, () => {
    // the typed key union of the messages is too deep for the compiler: the test only needs strings
    const make = createI18n as unknown as (options: Record<string, unknown>) => {
      global: { t: (key: string) => string };
    };
    const i18n = make({
      legacy: false,
      locale,
      messages: { 'zh-CN': zh, 'en-US': en },
      missingWarn: false,
      fallbackWarn: false,
      warnHtmlMessage: false
    });
    const translate = i18n.global.t;
    const all: Array<[string, string]> = [];
    leaves(locale === 'zh-CN' ? zh : en, '', all);
    const broken: string[] = [];
    for (const [path] of all) {
      try {
        translate(path);
      } catch (error) {
        broken.push(`${path}: ${(error as Error).message.split(String.fromCharCode(10))[0]}`);
      }
    }
    assert.deepEqual(broken, []);
  });
}
