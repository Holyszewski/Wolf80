// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// How the build embeds the demo programs (tools/program-assets.mjs): assembled by default, with the
// gzipped sources on request, and never from a stale Intel HEX.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { embedPrograms } from '../tools/program-assets.mjs';
import { programBlocks, programSource } from '../src/machine/programs.js';

const root = new URL('../', import.meta.url);
const programsDir = new URL('programs/', root);
const catalog = JSON.parse(fs.readFileSync(new URL('catalog.json', programsDir), 'utf8'));
const b64 = s => Buffer.from(s, 'base64');
// the bytes the blocks put into memory, whatever way they are cut into blocks
const image = blocks => {
  const mem = new Map();
  for (const { addr, bytes } of blocks) bytes.forEach((v, i) => mem.set(addr + i, v));
  return [...mem].sort((a, b) => a[0] - b[0]);
};
const asmEntries = catalog.programs.filter(p => p.format === 'asm');

test('the default build embeds assembled programs, not sources, and they load as the sources do', () => {
  const embedded = embedPrograms(catalog);
  assert.equal(embedded.length, catalog.programs.length);
  assert.ok(asmEntries.length > 0);
  embedded.forEach((e, i) => {
    const orig = catalog.programs[i];
    assert.equal(e.source, undefined, orig.id);
    assert.equal(e.id, orig.id);
    if (orig.format !== 'asm') { assert.equal(e.format, orig.format, orig.id); assert.equal(e.sourceFormat, undefined); return; }
    assert.equal(e.format, 'ihex', orig.id);
    assert.equal(e.sourceFormat, 'asm', orig.id);
    const fromSource = programBlocks(orig, fs.readFileSync(new URL(orig.file, programsDir)));
    assert.deepEqual(image(programBlocks(e, b64(e.data))), image(fromSource), orig.id);
  });
  assert.equal(catalog.programs.find(p => p.format === 'asm').format, 'asm', 'the catalog itself is not changed');
});

test('--with-sources adds the source of every asm entry, gzipped, and it unpacks to the exact file', async () => {
  const embedded = embedPrograms(catalog, { withSources: true });
  for (const [i, orig] of catalog.programs.entries()) {
    const e = embedded[i];
    if (orig.format !== 'asm') { assert.equal(e.source, undefined, orig.id); continue; }
    const file = fs.readFileSync(new URL(orig.file, programsDir));
    assert.ok(e.source, orig.id);
    assert.deepEqual(zlib.gunzipSync(b64(e.source)), file, orig.id);
    assert.equal(await programSource(e), file.toString('utf8'), orig.id);
    assert.equal(e.format, 'ihex'); // the rest is the same as without the switch
  }
  assert.deepEqual(embedded.map(({ source, ...rest }) => rest), embedPrograms(catalog));
});

test('programSource gives null without a source and round-trips text', async () => {
  assert.equal(await programSource({ id: 'x' }), null);
  const text = 'ORG 0800h\n; Světelný had\nHLT\n';
  assert.equal(await programSource({ source: zlib.gzipSync(Buffer.from(text, 'utf8')).toString('base64') }), text);
});

test('the build fails on a missing or stale Intel HEX and names the program', () => {
  const entry = asmEntries[0];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolf80-assets-'));
  try {
    const hexFile = entry.file.replace(/\.[^./]+$/, '') + '.hex';
    fs.mkdirSync(path.dirname(path.join(dir, entry.file)), { recursive: true });
    fs.copyFileSync(new URL(entry.file, programsDir), path.join(dir, entry.file));
    const options = { programsDir: pathToFileURL(dir + path.sep) };
    const one = { programs: [entry] };
    assert.throws(() => embedPrograms(one, options), err => err.message.includes(entry.id) && /missing/.test(err.message) && err.message.includes('node tools/make-listings.mjs'));
    const hex = fs.readFileSync(new URL(hexFile, programsDir), 'utf8');
    fs.writeFileSync(path.join(dir, hexFile), hex);
    assert.equal(embedPrograms(one, options)[0].format, 'ihex'); // a good copy passes
    fs.appendFileSync(path.join(dir, entry.file), '\n        NOP\n');
    assert.throws(() => embedPrograms(one, options), err => err.message.includes(entry.id) && /does not match/.test(err.message) && err.message.includes('node tools/make-listings.mjs'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
