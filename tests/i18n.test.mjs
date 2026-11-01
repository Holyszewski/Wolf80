// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// The English and Czech UI texts: the same keys and parameters, and every key the page uses exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { UI_LANGS, UI_TEXT, uiText } from '../src/ui/i18n.js';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const params = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

test('both catalogues have the same keys and parameters', () => {
  assert.deepEqual(UI_LANGS, Object.keys(UI_TEXT));
  const en = UI_TEXT.en, cs = UI_TEXT.cs;
  assert.deepEqual(Object.keys(cs).sort(), Object.keys(en).sort());
  for (const k of Object.keys(en)) {
    assert.deepEqual(params(cs[k]), params(en[k]), k);
    assert.ok(en[k].trim() && cs[k].trim(), `${k} is empty`);
  }
});

test('every key used by index.html and app.js exists', () => {
  const html = read('src/ui/index.html'), js = read('src/ui/app.js');
  const used = new Set([
    ...[...html.matchAll(/data-i18n(?:-html|-title|-placeholder|-aria)?="([^"]+)"/g)].map(m => m[1]),
    ...[...js.matchAll(/'data-i18n(?:-html|-title|-placeholder|-aria)?': '([^']+)'/g)].map(m => m[1]),
    ...[...js.matchAll(/\bt\('([\w.]+)'/g)].map(m => m[1]),
    ...[...js.matchAll(/\b(?:h3)\('([\w.]+)'\)/g)].map(m => m[1]),
    ...[...js.matchAll(/'((?:tahak|ops|dbg|board|sound|keys|prog)\.\w+)'/g)].map(m => m[1]), // also the keys in BOARD_UI
  ]);
  assert.ok(used.size > 100, `only ${used.size} keys found`);
  for (const k of used) assert.ok(k in UI_TEXT.en, `missing key ${k}`);
});

test('uiText fills parameters and falls back to English', () => {
  assert.equal(uiText('cs', 'mem.written', { n: 3, where: '1C00–1C02', ram: '1C00–1FFF' }),
    'Zapsáno 3 B: 1C00–1C02. Bajty mimo RAM (1C00–1FFF) se nezapíšou.');
  assert.equal(uiText('de', 'run.step'), 'Step');
  assert.equal(uiText('en', 'no.such.key'), 'no.such.key');
});
