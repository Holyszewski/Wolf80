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
// need no file. A source for an EPROM (see epromBlocks) gets
// the contents of the EPROM, and a third file, <name>.bin: the whole EPROM, FFh where it is empty.
// One that fills more than a kibibyte also gets a file for each 1 KiB EPROM of the board, named
// after its first address: <name>-0000.bin, <name>-0400.bin.
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

// The blocks of an assembled source as they lie in an EPROM. A program in an EPROM that changes
// its own code keeps that part in the EPROM and copies it to RAM when it starts: the source
// assembles the part at its RAM addresses, between the labels RAM_BEGIN and RAM_END, and the label
// ROM_END says where it lies in the EPROM. A program for an EPROM that copies nothing has the
// label ROM_END alone, at its end. A source without ROM_END is returned as it is.
export function epromBlocks({ blocks, symbols }) {
  const { ROM_END: rom, RAM_BEGIN: from, RAM_END: to } = symbols;
  if (rom === undefined) return blocks;
  if ((from === undefined) !== (to === undefined)) throw new Error('RAM_BEGIN and RAM_END go together');
  const placed = blocks.filter(b => b.bytes.length)
    .map(b => ({ addr: from !== undefined && b.addr >= from && b.addr < to ? rom + b.addr - from : b.addr, bytes: b.bytes }))
    .sort((a, b) => a.addr - b.addr);
  const out = [];
  for (const b of placed) {
    const last = out.at(-1);
    if (last && last.addr + last.bytes.length > b.addr) throw new Error('the blocks of the EPROM overlap');
    if (last && last.addr + last.bytes.length === b.addr) last.bytes = Uint8Array.from([...last.bytes, ...b.bytes]);
    else out.push({ addr: b.addr, bytes: Uint8Array.from(b.bytes) });
  }
  return out;
}

// The whole EPROM of such a source: from the first address to the end of its kibibyte, FFh where
// nothing is programmed.
export function epromImage(blocks) {
  const start = blocks[0].addr, end = blocks.at(-1).addr + blocks.at(-1).bytes.length;
  const image = new Uint8Array(Math.ceil((end - start) / 1024) * 1024).fill(0xff);
  for (const b of blocks) image.set(b.bytes, b.addr - start);
  return image;
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
    const blocks = epromBlocks(r);
    out.set(stem + '.hex', { text: toIntelHexBlocks(blocks), entry: null, blocks });
    out.set(stem + '-bytes.txt', { text: bytesText(blocks), entry: null, blocks });
    if (blocks !== r.blocks) {
      const image = epromImage(blocks);
      out.set(stem + '.bin', { bytes: image, entry: null, blocks });
      for (let i = 0; image.length > 1024 && i < image.length; i += 1024) {
        const a = blocks[0].addr + i;
        out.set(`${stem}-${hex2(a >> 8)}${hex2(a & 0xff)}.bin`, { bytes: image.subarray(i, i + 1024), entry: null, blocks, offset: i });
      }
    }
  }
  // a .bin has `bytes` in place of `text`; the one of a single EPROM out of several also `offset`,
  // where it begins in the whole image
  return [...out].map(([path, v]) => ({ path, ...v }));
}

// The files whose contents differ from what the sources give (a missing file counts).
export function staleListings() {
  return listings().filter(({ path, text, bytes }) => {
    try {
      const file = fs.readFileSync(new URL(path, root));
      return bytes ? !file.equals(Buffer.from(bytes)) : file.toString('utf8') !== text;
    } catch { return true; }
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
    for (const { path, text, bytes } of all) fs.writeFileSync(new URL(path, root), bytes ?? text);
    console.log(`${all.length} files written beside ${all.filter(f => f.path.endsWith('.hex')).length} programs`);
  }
}
