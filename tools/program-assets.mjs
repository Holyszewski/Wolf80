// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// The demo programs as tools/build.mjs embeds them in WOLF80_ASSETS.programs.
//
// Why the assembler sources are not embedded by default: they were 471 kB of an 834 kB offline
// file, and nothing in the app reads them except the assembler at load time, while every new game
// adds about 60 kB. So an 'asm' entry is embedded as the Intel HEX that tools/make-listings.mjs
// writes beside it (format 'ihex', sourceFormat 'asm'), and the app loads it through the ordinary
// 'ihex' path. The build fails when that HEX is missing or does not match its source.
// `node tools/build.mjs --with-sources` adds the source to each such entry as `source` (gzip,
// base64; programSource() in src/machine/programs.js unpacks it), for a future in-app source view.
// The maintainer's decision and its background are in CLAUDE.md (Demo programs) and
// programs/README.md.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { programBlocks } from '../src/machine/programs.js';
import { toIntelHexBlocks } from '../src/machine/memfile.js';

const root = new URL('../', import.meta.url);

// The embedded form of every catalog entry; `programsDir` is a URL of the folder holding
// catalog.json and the files it names.
export function embedPrograms(catalog, { withSources = false, programsDir = new URL('programs/', root) } = {}) {
  return catalog.programs.map(entry => {
    if (!entry.file) return { ...entry, data: '' };
    const read = file => fs.readFileSync(new URL(file, programsDir));
    if (entry.format !== 'asm') return { ...entry, data: read(entry.file).toString('base64') };
    const src = read(entry.file);
    const hexFile = entry.file.replace(/\.[^./]+$/, '') + '.hex';
    const hint = 'run node tools/make-listings.mjs';
    let hex;
    try { hex = fs.readFileSync(new URL(hexFile, programsDir), 'utf8'); } catch { throw new Error(`${entry.id}: programs/${hexFile} is missing, ${hint}`); }
    if (hex !== toIntelHexBlocks(programBlocks(entry, src))) throw new Error(`${entry.id}: programs/${hexFile} does not match ${entry.file}, ${hint}`);
    const out = { ...entry, format: 'ihex', sourceFormat: 'asm', data: Buffer.from(hex, 'utf8').toString('base64') };
    if (withSources) out.source = zlib.gzipSync(src, { level: 9 }).toString('base64');
    return out;
  });
}
