// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Writes two listings beside every demo program of programs/catalog.json that is an 8080 source
// ('asm') or a binary image ('bin'), and beside every source in extras/ (the programs outside the
// catalogue), so that each program can be handed out on its own, to be typed into a real board or
// burnt into an EPROM, without the emulator:
//   <name>.hex        Intel HEX
//   <name>-bytes.txt  the bytes for typing in by hand, 16 to a line: address, a colon, the bytes
// Both hold exactly the blocks the emulator loads. Programs already in Intel HEX or inside a ROM
// need no file.
//
//   node tools/make-listings.mjs           write the files
//   node tools/make-listings.mjs --check   write nothing, fail if a file is missing or out of date
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { programBlocks } from '../src/machine/programs.js';
import { assemble } from '../src/asm/asm8080.js';
import { toIntelHexBlocks } from '../src/machine/memfile.js';

const root = new URL('../', import.meta.url);
const programsDir = new URL('programs/', root);
const extrasDir = new URL('extras/', root);

const hex2 = v => v.toString(16).toUpperCase().padStart(2, '0');

export function bytesText(blocks) {
  const lines = [];
  for (const { addr, bytes } of blocks) {
    for (let i = 0; i < bytes.length; i += 16) {
      const a = addr + i;
      lines.push(`${hex2(a >> 8)}${hex2(a & 0xff)}: ${[...bytes.subarray(i, i + 16)].map(hex2).join(' ')}`);
    }
  }
  return lines.join('\n') + '\n';
}

// [{ path, text, entry, blocks }] with the path relative to the repository, e.g.
// 'programs/cosmos/cosmos-savia.hex' and 'programs/cosmos/cosmos-savia-bytes.txt'; entry is null
// for the extras.
export function listings() {
  const catalog = JSON.parse(fs.readFileSync(new URL('catalog.json', programsDir), 'utf8'));
  const out = new Map();
  for (const entry of catalog.programs) {
    if (entry.format !== 'asm' && entry.format !== 'bin') continue;
    const stem = entry.file.replace(/\.[^./]+$/, '');
    if (out.has(stem + '.hex')) continue;
    const blocks = programBlocks(entry, fs.readFileSync(new URL(entry.file, programsDir)));
    if (!blocks.some(b => b.bytes.length)) throw new Error(`${entry.id}: no bytes`);
    out.set('programs/' + stem + '.hex', { text: toIntelHexBlocks(blocks), entry, blocks });
    out.set('programs/' + stem + '-bytes.txt', { text: bytesText(blocks), entry, blocks });
  }
  const extras = fs.existsSync(extrasDir) ? fs.readdirSync(extrasDir, { recursive: true }) : [];
  for (const file of extras.map(f => f.replaceAll('\\', '/')).filter(f => f.endsWith('.asm')).sort()) {
    const r = assemble(fs.readFileSync(new URL(file, extrasDir), 'utf8'));
    if (r.errors.length) throw new Error(`extras/${file}: line ${r.errors[0].line}: ${r.errors[0].message}`);
    if (!r.blocks.some(b => b.bytes.length)) throw new Error(`extras/${file}: no bytes`);
    const stem = 'extras/' + file.replace(/\.asm$/, '');
    out.set(stem + '.hex', { text: toIntelHexBlocks(r.blocks), entry: null, blocks: r.blocks });
    out.set(stem + '-bytes.txt', { text: bytesText(r.blocks), entry: null, blocks: r.blocks });
  }
  return [...out].map(([path, v]) => ({ path, ...v }));
}

// The files whose contents differ from what the sources give (a missing file counts).
export function staleListings() {
  return listings().filter(({ path, text }) => {
    try { return fs.readFileSync(new URL(path, root), 'utf8') !== text; } catch { return true; }
  }).map(f => f.path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const stale = staleListings();
    for (const path of stale) console.error(`out of date: ${path}`);
    if (stale.length) process.exit(1);
    console.log('listings are up to date');
  } else {
    const all = listings();
    for (const { path, text } of all) fs.writeFileSync(new URL(path, root), text);
    console.log(`${all.length} files written beside ${all.length / 2} programs`);
  }
}
