// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Loading the demo programs of programs/catalog.json into a machine.

import { parseIntelHex } from './memfile.js';
import { assemble } from '../asm/asm8080.js';

// Memory blocks [{ addr, bytes }] of a catalog entry; `data` is the file's contents (Uint8Array).
export function programBlocks(entry, data) {
  if (entry.format === 'ihex') return parseIntelHex(new TextDecoder().decode(data));
  if (entry.format === 'bin') return [{ addr: parseInt(entry.load, 16), bytes: data }];
  if (entry.format === 'rom') return []; // already in the firmware, only started
  if (entry.format === 'asm') {
    const r = assemble(new TextDecoder().decode(data));
    if (r.errors.length) throw new Error(`${entry.id}: line ${r.errors[0].line}: ${r.errors[0].message}`);
    return r.blocks;
  }
  throw new Error(`${entry.id}: unknown format ${entry.format}`);
}

// The assembler source of an embedded catalog entry as text, or null when the build did not
// include it (it does only with `node tools/build.mjs --with-sources`). `entry.source` is the
// source gzipped and base64-encoded.
export async function programSource(entry) {
  if (!entry.source) return null;
  const gz = Uint8Array.from(atob(entry.source), c => c.charCodeAt(0));
  const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// Starts the program as a user would after typing it in: reset, the bytes go into memory, then
// the keys of `runKeys(start)` (the board's "run from address" command) are pressed one after
// another on the emulated keyboard, so the monitor itself starts the program and leaves its
// state (display pointer, stack) as a real start would. `holdStates` is how long each key is
// held and then released.
export function startProgram(machine, entry, data, { bootStates, holdStates, runKeys }) {
  machine.reset();
  machine.run(bootStates);
  for (const { addr, bytes } of programBlocks(entry, data)) {
    bytes.forEach((v, i) => machine.write((addr + i) & 0xffff, v));
  }
  for (const key of runKeys(entry.start)) {
    machine.pressKey(key);
    machine.run(holdStates);
    machine.releaseKey(key);
    machine.run(holdStates);
  }
}
