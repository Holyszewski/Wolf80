// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// Rebuild the three standalone sources and their loadable/manual-byte files.
import fs from 'node:fs';
import { assemble } from '../../src/asm/asm8080.js';
import { toIntelHex } from '../../src/machine/memfile.js';
const dir = new URL('./', import.meta.url);
const template = fs.readFileSync(new URL('game.asm.in', dir), 'utf8');
const io = fs.readFileSync(new URL('io.asm.in', dir), 'utf8');
// The maintainer's signature ends the image where RAM allows; the PMI-80's 1 KiB has no room for it.
const signature = "; The program's signature: Wolf, the year it was made and its version.\nSIGNATURE: DB 'Wolf2026','v010'";
const noSignature = '; No room for the Wolf2026 signature in the PMI-80 RAM: the monitor stack reaches 1FCBh.';
for (const [suffix, board, origin, dwell, cwr, invert, sign] of [
  ['pmi80', 'PMI-80, factory or PMI-80 C monitor', '1C00h', 21, '8Ah', '        CMA', noSignature],
  ['savia', 'Savia-84, factory monitor, nine digits', '1800h', 55, '88h', '', signature],
  ['stone1', 'Stone 1, Stone or STONE-PMI monitor', '1800h', 55, '88h', '        CMA', signature],
]) {
  let source = template.replace('@IO@', io).replaceAll('@BOARD@', board)
    .replaceAll('@ORIGIN@', origin).replace('@DWELL@', dwell)
    .replace('@CWR@', cwr).replace('@INVERT@', invert).replace('@SIGNATURE@', sign);
  const a = assemble(source);
  if (a.errors.length) throw Error(JSON.stringify(a.errors));
  if (a.symbols.VARS_END > 0x1ff0) throw Error(`RAM overflow: ${suffix} ${a.symbols.VARS_END.toString(16)}`);
  for (const [name, length] of [['FONT', 14], ['SCORES', 9]])
    if ((a.symbols[name] & 255) + length > 256) throw Error(`${name} crosses a page`);
  const block = a.blocks[0];
  if (a.blocks.length !== 1) throw Error('Expected contiguous code');
  const bytes = Buffer.from(block.bytes);
  const hex = n => n.toString(16).toUpperCase().padStart(4, '0');
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16)
    lines.push(`${hex(block.addr + i)}: ${[...bytes.subarray(i, i + 16)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
  source += '\n; Manual entry bytes (variables are initialized at start):\n' + lines.map(l => '; ' + l).join('\n') + '\n';
  const stem = `ship-captain-crew-${suffix}`;
  fs.writeFileSync(new URL(stem + '.asm', dir), source);
  fs.writeFileSync(new URL(stem + '.bin', dir), bytes);
  fs.writeFileSync(new URL(stem + '.hex', dir), toIntelHex(block.addr, bytes));
  fs.writeFileSync(new URL(stem + '-bytes.txt', dir), lines.join('\n') + '\n');
  console.log(`${suffix}: code ${hex(a.symbols.START)}-${hex(a.symbols.CODE_END - 1)}, variables ${hex(a.symbols.VARS)}-${hex(a.symbols.VARS_END - 1)}, ${bytes.length} bytes`);
}
