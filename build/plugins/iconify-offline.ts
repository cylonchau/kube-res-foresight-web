import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { getIcons } from '@iconify/utils';
import type { IconifyJSON } from '@iconify/vue';

const VIRTUAL_ID = 'virtual:iconify-offline';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * The menus come from the platform (permissions.icon, edited in the console), so these collections go in whole:
 * the platform's own menus are carbon, and anything typed there must still draw without the internet.
 */
const WHOLE_COLLECTIONS = ['carbon'];

const SOURCE_FILE = /\.(vue|ts|tsx|js|jsx)$/;
const ICON_NAME = /['"`]([a-z][a-z0-9-]*):([a-z0-9][a-z0-9-]*)['"`]/g;
const ICON_DASH_NAME = /['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)['"`]/g;

function listSourceFiles(dir: string, files: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, files);
    else if (SOURCE_FILE.test(entry.name)) files.push(full);
  }
  return files;
}

/**
 * Icons are drawn by @iconify/vue, which asks api.iconify.design for each icon the first time it is shown: with no internet the menus
 * and buttons stay empty. This puts the icons the console uses into the bundle, so nothing is fetched.
 */
export function setupIconifyOffline(rootDir: string): Plugin {
  const jsonDir = path.join(rootDir, 'node_modules/@iconify/json/json');

  const build = () => {
    const known = new Set(
      fs
        .readdirSync(jsonDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.slice(0, -5))
    );
    const wanted = new Map<string, Set<string>>();
    const want = (prefix: string, name: string) => {
      if (!wanted.has(prefix)) wanted.set(prefix, new Set());
      wanted.get(prefix)!.add(name);
    };
    for (const file of listSourceFiles(path.join(rootDir, 'src'))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(ICON_NAME)) {
        const [, prefix, name] = match;
        if (known.has(prefix)) want(prefix, name);
      }
      // Iconify also takes "mdi-help-circle" (a dash instead of the colon): every quoted word that starts with a collection prefix
      // is a candidate, and getIcons below keeps only the ones the collection really has.
      for (const match of text.matchAll(ICON_DASH_NAME)) {
        const word = match[1];
        for (let i = word.indexOf('-'); i > 0; i = word.indexOf('-', i + 1)) {
          const prefix = word.slice(0, i);
          if (known.has(prefix)) want(prefix, word.slice(i + 1));
        }
      }
    }
    for (const prefix of WHOLE_COLLECTIONS) wanted.delete(prefix);

    const collections: IconifyJSON[] = [];
    for (const prefix of WHOLE_COLLECTIONS) {
      collections.push(JSON.parse(fs.readFileSync(path.join(jsonDir, `${prefix}.json`), 'utf8')));
    }
    for (const [prefix, names] of wanted) {
      const data: IconifyJSON = JSON.parse(fs.readFileSync(path.join(jsonDir, `${prefix}.json`), 'utf8'));
      const subset = getIcons(data, [...names]);
      if (subset) collections.push(subset);
    }
    return collections;
  };

  return {
    name: 'iconify-offline',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      return `export default ${JSON.stringify(build())};`;
    }
  };
}
