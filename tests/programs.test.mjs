// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// The demo programs of programs/catalog.json load and run on their boards and monitors.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Pmi80, PMI80_CLOCK_HZ, PMI80_DIGITS } from '../src/board/pmi80.js';
import { BOARD_PROFILES, programFits } from '../src/board/profiles.js';
import { litMasks } from '../src/machine/display.js';
import { startProgram, programBlocks } from '../src/machine/programs.js';
import { parseIntelHex, parsePlainHex, toIntelHex } from '../src/machine/memfile.js';
import { assemble } from '../src/asm/asm8080.js';
import { listings, staleListings } from '../tools/make-listings.mjs';

const root = new URL('../', import.meta.url);
const ROM = fs.readFileSync(new URL('roms/pmi80/pmi80_monitor.bin', root));
const ROMS = {
  pmi80: ROM,
  savia84: fs.readFileSync(new URL('roms/savia84/savia84_monitor.bin', root)),
  pmi80c: fs.readFileSync(new URL('roms/pmi80/pmi80c_monitor.bin', root)),
  pmi80cgames: fs.readFileSync(new URL('roms/pmi80/pmi80c_games.bin', root)),
  stonepmi: fs.readFileSync(new URL('roms/stone1/stone_pmi.bin', root)),
};
const catalog = JSON.parse(fs.readFileSync(new URL('programs/catalog.json', root), 'utf8'));
const ms = t => Math.round(t * PMI80_CLOCK_HZ / 1000);
const fileOf = p => (p.file ? fs.readFileSync(new URL('programs/' + p.file, root)) : new Uint8Array(0));

test('every catalog entry has a file, a start address and Czech and English help', () => {
  const readme = fs.readFileSync(new URL('programs/README.md', root), 'utf8');
  for (const p of catalog.programs) {
    assert.ok(BOARD_PROFILES[p.board], `${p.id}: unknown board ${p.board}`);
    assert.ok(BOARD_PROFILES[p.board].firmware.some(f => programFits(p, p.board, f.id)), `${p.id}: no firmware fits`);
    assert.match(p.start, /^[0-9A-F]{4}$/);
    assert.ok(p.help.cs && p.help.en, p.id);
    if (p.version !== undefined) assert.match(p.version, /^\d+\.\d+\.\d+$/, `${p.id}: version`);
    for (const f of ['name', 'author']) {
      assert.ok(typeof p[f] === 'string' || (p[f].cs && p[f].en), `${p.id}: ${f} is a text or has cs and en`);
    }
    if (p.format === 'rom') { assert.equal(p.file, undefined, p.id); continue; }
    const data = fileOf(p);
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    assert.ok(readme.includes(hash), `${p.id}: SHA-256 not listed in programs/README.md`);
    assert.ok(programBlocks(p, data).length > 0);
  }
});

// A machine of the program's board and firmware, started as the side panel does it.
function boardFor(p) {
  const profile = BOARD_PROFILES[p.board];
  const fw = profile.firmware.find(f => programFits(p, p.board, f.id));
  return { profile, fw, machine: fw.create(ROMS), at: t => Math.round(t * profile.clockHz / 1000) };
}
function start(p) {
  const { profile, fw, machine, at } = boardFor(p);
  startProgram(machine, p, fileOf(p), { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys });
  return machine;
}
function shown(pmi, t = 200, clockHz = PMI80_CLOCK_HZ) {
  pmi.display.takeFrame(pmi.cycles);
  pmi.run(Math.round(t * clockHz / 1000));
  return litMasks(pmi.display.takeFrame(pmi.cycles), PMI80_DIGITS);
}

for (const p of catalog.programs) for (const fw of BOARD_PROFILES[p.board].firmware.filter(f => programFits(p, p.board, f.id))) {
  test(`${p.name.en ?? p.name} (${p.board}, ${fw.id}) runs and lights the display`, () => {
    const { profile, at } = boardFor(p);
    const idle = fw.create(ROMS);
    idle.run(at(500));
    const greeting = shown(idle, 200, profile.clockHz);
    const m = fw.create(ROMS);
    startProgram(m, p, fileOf(p), { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys });
    m.run(at(500));
    const masks = shown(m, 200, profile.clockHz);
    assert.ok(masks.some(x => x !== 0), 'nothing lit');
    assert.notDeepEqual(masks, greeting);
    assert.equal(m.cpu.halted, false);
  });
}

// The ports are checked against the originals in the ROM: both are started at their entries with
// the same RAM and the same keys at the same times, and both must write the same values to the
// 8255 in the same order (port C as the digit index, whichever way the board inverts it). The
// original runs on the board and firmware that carry it; the port runs on the board it is for,
// except the PMI-80 ports, which run on a PMI-80 with PMI-80 C, so that COSMOS reads the same ROM
// pages for its obstacles as the original (with the factory monitor they come from its ROM). The
// Stone 1 ports run on the Stone 1 with STONE-PMI while its own monitor is withheld (docs/stone1.md).
const PORTS = [
  // id, entry of the original, label of the port's entry, keys, original's [board, firmware],
  // port's [board, firmware], the port's board inverts the digit index
  ['cosmos-savia', 0x0440, 'COSMOS', [[1500, '5'], [2500, '4'], [3000, '0']], ['stone1', 'stone-pmi'], ['savia84', 'factory'], false],
  ['tenis3-savia', 0x0660, 'TENIS3', [[1500, '5'], [2500, '7']], ['stone1', 'stone-pmi'], ['savia84', 'factory'], false],
  ['cosmos-stone1', 0x0440, 'COSMOS', [[1500, '5'], [2500, '4'], [3000, '0']], ['stone1', 'stone-pmi'], ['stone1', 'stone-pmi'], true],
  ['tenis3-stone1', 0x0660, 'TENIS3', [[1500, '5'], [2500, '7']], ['stone1', 'stone-pmi'], ['stone1', 'stone-pmi'], true],
  ['cosmos-pmi80', 0x0440, 'COSMOS', [[1500, '5'], [2500, '4'], [3000, '0']], ['pmi80', 'pmi80c'], ['pmi80', 'pmi80c'], true],
  ['tenis3-pmi80', 0x0660, 'TENIS3', [[1500, '5'], [2500, '7']], ['pmi80', 'pmi80c'], ['pmi80', 'pmi80c'], true],
];
const machineOf = ([board, fw]) => BOARD_PROFILES[board].firmware.find(f => f.id === fw).create(ROMS);
for (const [id, entry, label, keys, orig, port, inverted] of PORTS) {
  test(`${id}: the port writes to the 8255 what the original in the ROM does`, () => {
    const src = fs.readFileSync(new URL(`programs/${id.split("-")[0]}/${id}.asm`, root), 'utf8');
    const asm = assemble(src);
    assert.deepEqual(asm.errors, []);
    const original = machineOf(orig), ported = machineOf(port);
    const hz = BOARD_PROFILES[orig[0]].clockHz;
    const logs = [[original, true, entry], [ported, inverted, asm.symbols[label]]].map(([m, inv, pc]) => {
      m.run(Math.round(hz / 20));
      for (let a = 0x1f00; a < 0x2000; a++) m.write(a, 0x19);
      if (m === ported) for (const b of asm.blocks) b.bytes.forEach((v, i) => m.write(b.addr + i, v));
      m.write(0x1ffc, 0xef); m.write(0x1ffd, 0x1f);
      m.cpu.pc = pc;
      m.cpu.sp = 0x1fd9;
      const log = [];
      const out = m.cpu.bus.output;
      m.cpu.bus.output = (p, v) => {
        out(p, v);
        const q = p & 0xff;
        if (q === 0xf8) log.push(v);
        if (q === 0xfa) log.push(0x100 | ((inv ? ~v : v) & 0x0f));
      };
      const ms = t => Math.round(t * hz / 1000);
      const t0 = m.cycles;
      for (const [t, key] of keys) {
        m.run(t0 + ms(t) - m.cycles);
        m.pressKey(key);
        m.run(ms(100));
        m.releaseKey(key);
      }
      m.run(t0 + ms(4000) - m.cycles);
      return log;
    });
    // a COSMOS port with copies of the ROM pages is a few states slower (its three ORI), so it may
    // be a write or two behind at the end
    const n = Math.min(logs[0].length, logs[1].length);
    assert.ok(n > 30000, `${n} writes`);
    assert.ok(Math.abs(logs[0].length - logs[1].length) < 10, `${logs[0].length} / ${logs[1].length} writes`);
    for (let i = 0; i < n; i++) assert.equal(logs[1][i], logs[0][i], `write ${i}`);
  });
}

test('Mikrovarhany: idle text, tone on K3 with the computed pitch, dark display while playing', () => {
  const p = catalog.programs.find(x => x.id === 'mikrovarhany');
  const pmi = start(p);
  // " uArHAnY " lit segments
  assert.deepEqual(shown(pmi), [0x00, 0x1c, 0x77, 0x50, 0x76, 0x77, 0x54, 0x6e, 0x00]);
  const expected = { 0: 261.25, 5: 439.52, F: 1165.91 };
  for (const [key, hz] of Object.entries(expected)) {
    pmi.pressKey(key);
    pmi.run(ms(20));
    pmi.takeAudio();
    pmi.display.takeFrame(pmi.cycles);
    pmi.run(ms(500));
    const chunk = pmi.takeAudio();
    const frame = litMasks(pmi.display.takeFrame(pmi.cycles), PMI80_DIGITS);
    const periods = chunk.edges.length / 2;
    const measured = periods / ((chunk.to - chunk.from) / PMI80_CLOCK_HZ);
    assert.ok(Math.abs(measured - hz) < hz * 0.01, `key ${key}: ${measured.toFixed(1)} Hz, expected ${hz}`);
    assert.deepEqual(frame, [0, 0, 0, 0, 0, 0, 0, 0, 0], `key ${key}: display not dark`);
    pmi.releaseKey(key);
    pmi.run(ms(50));
    pmi.takeAudio();
    pmi.run(ms(100));
    assert.equal(pmi.takeAudio().edges.length, 0, `key ${key}: still sounding after release`);
  }
});

test('Mikrovarhany: = switches to semitones and back', () => {
  const pmi = start(catalog.programs.find(x => x.id === 'mikrovarhany'));
  const tap = key => { pmi.pressKey(key); pmi.run(ms(60)); pmi.releaseKey(key); pmi.run(ms(60)); };
  tap('=');
  // " PuLtony " lit segments
  assert.deepEqual(shown(pmi), [0x00, 0x73, 0x1c, 0x38, 0x78, 0x5c, 0x54, 0x6e, 0x00]);
  pmi.pressKey('1');
  pmi.run(ms(20));
  pmi.takeAudio();
  pmi.run(ms(500));
  const chunk = pmi.takeAudio();
  const hz = chunk.edges.length / 2 / ((chunk.to - chunk.from) / PMI80_CLOCK_HZ);
  assert.ok(Math.abs(hz - 276.88) < 3, `cis1: ${hz} Hz`);
  pmi.releaseKey('1');
  pmi.run(ms(60));
  tap('=');
  assert.deepEqual(shown(pmi), [0x00, 0x1c, 0x77, 0x50, 0x76, 0x77, 0x54, 0x6e, 0x00]);
});

test('AION Buzzer 80: the assembler rebuilds the distributed HEX, and it plays through K3', () => {
  const p = catalog.programs.find(x => x.id === 'aion-buzzer-80');
  const image = blocks => {
    const m = new Uint8Array(0x10000);
    for (const b of blocks) m.set(b.bytes, b.addr);
    return m;
  };
  const asm = assemble(fs.readFileSync(new URL('programs/aion-buzzer-80/AION-Buzzer-80-RAM-display.asm', root), 'utf8'));
  assert.deepEqual(asm.errors, []);
  const hex = parseIntelHex(fs.readFileSync(new URL('programs/' + p.file, root), 'utf8'));
  assert.deepEqual(image(asm.blocks), image(hex));
  const pmi = start(p);
  pmi.run(ms(500));
  pmi.takeAudio();
  pmi.run(ms(1000));
  assert.ok(pmi.takeAudio().edges.length > 200, 'no sound on K3');
});

test('K3 output is the NAND of PA6 and PA7', () => {
  const pmi = new Pmi80({ rom: ROM });
  pmi.output(0xfb, 0x8a);
  for (const [pa, level] of [[0xff, 0], [0x7f, 1], [0xbf, 1], [0xc0, 0], [0x3f, 1]]) {
    pmi.output(0xf8, pa);
    assert.equal(pmi.k3.level, level, `PA ${pa.toString(16)}`);
  }
});

test('every assembled or binary program has its Intel HEX and byte list beside it, up to date (node tools/make-listings.mjs)', () => {
  assert.deepEqual(staleListings(), []);
  const image = blocks => {
    const m = new Uint8Array(0x10000);
    for (const b of blocks) m.set(b.bytes, b.addr);
    return m;
  };
  for (const { path, text, blocks } of listings()) {
    // the listing read back gives the program's image: the HEX through the parser, the byte list
    // as lines of an address, a colon and up to 16 bytes
    const back = path.endsWith('.hex') ? parseIntelHex(text) : text.trimEnd().split('\n').map(line => {
      assert.match(line, /^[0-9A-F]{4}: [0-9A-F]{2}( [0-9A-F]{2}){0,15}$/, `${path}: ${line}`);
      return { addr: parseInt(line.slice(0, 4), 16), bytes: parsePlainHex(line.slice(6)) };
    });
    assert.deepEqual(image(back), image(blocks), path);
  }
});

test('Intel HEX round trip', () => {
  const bytes = Uint8Array.from({ length: 40 }, (_, i) => i * 7);
  const blocks = parseIntelHex(toIntelHex(0x1c00, bytes));
  assert.deepEqual(blocks.map(b => b.addr), [0x1c00, 0x1c10, 0x1c20]);
  assert.deepEqual(blocks.flatMap(b => [...b.bytes]), [...bytes]);
});
