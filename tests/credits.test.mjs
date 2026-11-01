// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// CREDITS.txt beside the EXE (tools/credits.mjs): every program is credited, nothing is left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { creditsText } from '../tools/credits.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('programs/catalog.json'));
const credits = creditsText(read('desktop/CREDITS-desktop.txt'), catalog, '9.8.7');
const flat = credits.replace(/\s+/g, ' ');

test('names the version and fills every placeholder', () => {
  assert.match(credits, /^Wolf80 9\.8\.7 /);
  assert.doesNotMatch(credits, /\{\w+\}/);
});

test('credits every program with its author', () => {
  for (const p of catalog.programs) {
    const author = typeof p.author === 'string' ? p.author : p.author.en;
    assert.ok(flat.includes(author), `${p.id}: ${author}`);
  }
});

test('knows every board and firmware of the catalogue', () => {
  assert.doesNotMatch(credits, /with the (factory|pmi80c|stone1|stone-pmi)\b(?! monitor)/);
  for (const board of new Set(catalog.programs.map(p => p.board))) assert.ok(['pmi80', 'savia84', 'stone1'].includes(board), board);
});
