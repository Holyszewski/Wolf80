// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// The PMI-80 board running its factory monitor ROM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Pmi80, PMI80_CLOCK_HZ, PMI80_DIGITS, PMI80_MATRIX, pmi80RunKeys } from '../src/board/pmi80.js';
import { startProgram } from '../src/machine/programs.js';
import { Glow, litMasks } from '../src/machine/display.js';
import { assemble } from '../src/asm/asm8080.js';

const ROM = fs.readFileSync(new URL('../roms/pmi80/pmi80_monitor.bin', import.meta.url));
const ms = t => Math.round(t * PMI80_CLOCK_HZ / 1000);

// Character codes of the monitor and their segment masks (active low), from its table at 01BEh.
const MASK = { '"': 0x5d, P: 0x0c, M: 0x48, I: 0x79, ' ': 0x7f, '-': 0x3f, 8: 0x00, 0: 0x40, '?': 0x2c };
const lit = text => [...text].map(ch => (~MASK[ch]) & 0x7f);

function shown(pmi) {
  pmi.display.takeFrame(pmi.cycles);
  pmi.run(ms(30));
  return litMasks(pmi.display.takeFrame(pmi.cycles), PMI80_DIGITS);
}

function tap(pmi, key) {
  pmi.pressKey(key);
  pmi.run(ms(60));
  pmi.releaseKey(key);
  pmi.run(ms(60));
}

test('the ROM is the factory monitor', () => {
  const hash = crypto.createHash('sha256').update(ROM).digest('hex');
  assert.equal(hash, '1717e466e24054ea52722476a82dcc3d471ac218dc144898f376030c64bd12fa');
});

test('after power on the display shows "PMI -80"', () => {
  const pmi = new Pmi80({ rom: ROM });
  pmi.run(ms(50));
  assert.deepEqual(shown(pmi), lit('"PMI -80"'));
});

// Counted from the DISP code (0140h) without a key: a digit is lit from its OUT F8h with the
// segments to the next OUT F8h with 7Fh, 158 states; one loop is 255 states, ten loops plus
// DISP's entry and exit and the OUTKE loop around it make about 2700 states (2.4 ms at
// 1.111 MHz). So each digit is lit about 158 / 2700 = 5.85 % of the time.
test('all nine digits get the same share of time, as counted from the DISP code', () => {
  const pmi = new Pmi80({ rom: ROM });
  pmi.run(ms(50));
  pmi.display.takeFrame(pmi.cycles);
  pmi.run(ms(100));
  const frame = pmi.display.takeFrame(pmi.cycles);
  // segment a (bit 0) is lit on digits 1 (P), 2 (M), 6 (8) and 7 (0)
  const shares = [1, 2, 6, 7].map(d => frame.on[d * 8] / frame.duration);
  for (const s of shares) assert.ok(Math.abs(s - shares[0]) < 0.01, shares.join(' '));
  assert.ok(Math.abs(shares[0] - 158 / 2700) < 0.002, `share ${shares[0]}`);
});

test('every key gives its monitor code through DISP', () => {
  const codes = {
    0: 0x80, 1: 0x81, 2: 0x82, 3: 0x83, 4: 0x84, 5: 0x85, 6: 0x86, 7: 0x87,
    8: 0x88, 9: 0x89, A: 0x8a, B: 0x8b, C: 0x8c, D: 0x8d, E: 0x8e, F: 0x8f,
    '=': 0x90, EX: 0x91, M: 0x92, L: 0x93, S: 0x94, BR: 0x97, R: 0x9a,
  };
  assert.deepEqual(Object.keys(codes).sort(), Object.keys(PMI80_MATRIX).sort());
  // 1C00: CALL DISP / JNC 1C00 / STA 1D00 / HLT, with the monitor's video pointer set.
  const program = [0xcd, 0x40, 0x01, 0xd2, 0x00, 0x1c, 0x32, 0x00, 0x1d, 0x76];
  for (const [key, code] of Object.entries(codes)) {
    const pmi = new Pmi80({ rom: ROM });
    pmi.ram.set(program, 0);
    pmi.write(0x1ffc, 0xef); pmi.write(0x1ffd, 0x1f);
    pmi.cpu.pc = 0x1c00;
    pmi.cpu.sp = 0x1f80;
    pmi.output(0xfb, 0x8a);
    pmi.pressKey(key);
    for (let i = 0; i < 100000 && !pmi.cpu.halted; i++) pmi.cpu.step();
    const a = pmi.read(0x1d00);
    assert.equal(((a >> 1) | (a << 7)) & 0xff, code, `key ${key}`); // DISP returns it rotated left
  }
});

test('a key leads to the command prompt, M to the memory command, RE back to the start', () => {
  const pmi = new Pmi80({ rom: ROM });
  pmi.run(ms(50));
  tap(pmi, '=');
  assert.deepEqual(shown(pmi), lit('?        '));
  tap(pmi, 'M');
  assert.equal(shown(pmi)[0], lit('M')[0]);
  pmi.pressKey('RE');
  pmi.run(ms(20));
  assert.deepEqual(shown(pmi), [0, 0, 0, 0, 0, 0, 0, 0, 0]); // held in reset: dark
  pmi.releaseKey('RE');
  pmi.run(ms(50));
  assert.deepEqual(shown(pmi), lit('"PMI -80"'));
});

test('memory map: RAM at 1C00h, mirrored at 3C00h; ROM is read-only; nothing above 3FFFh', () => {
  const pmi = new Pmi80({ rom: ROM });
  pmi.write(0x3c10, 0x5a);
  assert.equal(pmi.read(0x1c10), 0x5a);
  pmi.write(0x0000, 0x00);
  assert.equal(pmi.read(0x0000), ROM[0]);
  assert.equal(pmi.read(0x2000), ROM[0]);
  assert.equal(pmi.read(0x0400), 0xff); // no second EPROM
  pmi.write(0x5c10, 0x11);
  assert.equal(pmi.read(0x5c10), 0xff);
  assert.equal(pmi.read(0x1c10), 0x5a);
});

// Measured on a real PMI-80 (2026-10-24): M 0800 and M 4000 show 7Eh (the monitor reads with
// MOV A,M, opcode 7Eh), IN 00h reads 00h and IN 0Ch reads 0Ch (the port number just fetched).
test('an empty address or port returns the last value on the data bus', () => {
  const pmi = new Pmi80({ rom: ROM });
  pmi.ram.set([0x21, 0x00, 0x08, 0x7e, 0x32, 0x00, 0x1d, 0xdb, 0x0c, 0x32, 0x01, 0x1d, 0x76], 0); // LXI H,0800h / MOV A,M / STA / IN 0Ch / STA / HLT
  pmi.cpu.pc = 0x1c00;
  pmi.cpu.sp = 0x1f80;
  for (let i = 0; i < 20 && !pmi.cpu.halted; i++) pmi.cpu.step();
  assert.equal(pmi.read(0x1d00), 0x7e);
  assert.equal(pmi.read(0x1d01), 0x0c);
  assert.equal(pmi.read(0x0800), 0xff); // the debug view has no bus history
});

test('RAM starts with the 44h/BBh pattern seen on a real board', () => {
  const pmi = new Pmi80({ rom: ROM });
  assert.equal(pmi.read(0x1c00), 0x44);
  assert.equal(pmi.read(0x1c01), 0xbb);
  assert.equal(new Pmi80({ rom: ROM, ramFill: 0 }).read(0x1c01), 0);
});

test('the I key interrupts through RST 7 into the monitor vector 1FE6h', () => {
  const pmi = new Pmi80({ rom: ROM });
  // 1C00: EI / JMP 1C01 ; interrupt handler at 1FE6: MVI A,77 / HLT
  pmi.ram.set([0xfb, 0xc3, 0x01, 0x1c], 0);
  pmi.ram.set([0x3e, 0x77, 0x76], 0x3e6);
  pmi.cpu.pc = 0x1c00;
  pmi.cpu.sp = 0x1f80;
  pmi.run(100);
  pmi.pressKey('I');
  pmi.run(100);
  assert.deepEqual([pmi.cpu.halted, pmi.cpu.a], [true, 0x77]);
});

test('software PWM: smoothed brightness does not beat with the screen frame rate', () => {
  // Digit 0 with all segments lit half of the time, period about 7 ms, so a 1/60 s frame holds
  // about 2.4 periods and the raw share per frame swings; the 30 ms glow keeps it steady.
  const r = assemble(`
        ORG 1C00h
        MVI A,8Ah
        OUT 0FBh
        MVI A,0Fh       ; PC: digit 0 (the PMI-80 sends the inverted index)
        OUT 0FAh
LOOP:   MVI A,80h       ; PA: segments a-g lit (active low)
        OUT 0F8h
        MVI B,255
ON:     DCR B
        JNZ ON
        MVI A,0FFh      ; all dark
        OUT 0F8h
        MVI B,255
OFF:    DCR B
        JNZ OFF
        JMP LOOP`);
  assert.deepEqual(r.errors, []);
  const pmi = new Pmi80({ rom: ROM });
  for (const b of r.blocks) b.bytes.forEach((v, i) => pmi.write(b.addr + i, v));
  pmi.cpu.pc = 0x1c00;
  const glow = new Glow(PMI80_DIGITS * 8, 0.030 * PMI80_CLOCK_HZ);
  const raw = [], smooth = [];
  for (let n = 1; n <= 120; n++) {
    pmi.run(Math.round(n * PMI80_CLOCK_HZ / 60) - pmi.cycles);
    const f = pmi.display.takeFrame(pmi.cycles);
    const level = glow.update(f, pmi.cycles);
    if (n > 30) { raw.push(f.on[0] / f.duration); smooth.push(level[0]); }
  }
  const spread = a => Math.max(...a) - Math.min(...a);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(Math.abs(mean(smooth) - 0.5) < 0.02, `mean ${mean(smooth)}`);
  assert.ok(spread(raw) > 0.1, `raw spread ${spread(raw)}`);
  assert.ok(spread(smooth) < spread(raw) / 3, `smooth ${spread(smooth)} vs raw ${spread(raw)}`);
});

test('Glow holds the picture while paused and starts afresh after reset', () => {
  const glow = new Glow(1, 100);
  const frame = (duration, on) => ({ duration, on: Float64Array.of(on) });
  glow.update(frame(50, 50), 50);
  assert.equal(glow.level[0], 1);         // the first frame is taken as it is
  glow.update(frame(0, 0), 50);
  assert.equal(glow.level[0], 1);         // paused: held
  glow.update(frame(100, 0), 150);
  assert.ok(Math.abs(glow.level[0] - Math.exp(-1)) < 1e-12); // one time constant
  glow.update(frame(10, 0), 20);          // time went back: a new machine
  assert.equal(glow.level[0], 0);
});

// Nostalcomp's PMI-80 C (with the maintainer's text) and its second EPROM with the games.
const PMIC = fs.readFileSync(new URL('../roms/pmi80/pmi80c_monitor.bin', import.meta.url));
const GAMES = fs.readFileSync(new URL('../roms/pmi80/pmi80c_games.bin', import.meta.url));
const litC = codes => codes.map(c => (~PMIC[0x1be + c]) & 0x7f); // its own character table at 01BEh

test('PMI-80 C: the images, the greeting PMI -80 C and the scrolling text PMI-80 C', () => {
  assert.equal(crypto.createHash('sha256').update(PMIC).digest('hex'), '1440557a1ccc7669321ddadc8e4313936a73dcea4575a3e22114337f7a360aea');
  assert.equal(crypto.createHash('sha256').update(GAMES).digest('hex'), '2fbec278bef7fc05c683f8a4e4ad7fcc533f08eb79f57e7003987da893e25fc0');
  const pmi = new Pmi80({ rom: PMIC, rom2: GAMES });
  pmi.run(ms(100));
  assert.deepEqual(shown(pmi), litC([0x13, 0x16, 0x01, 0x19, 0x1f, 0x08, 0x00, 0x19, 0x0c]));
  assert.equal(pmi.read(0x0400), 0x37); // the game menu's marker
});

test('PMI-80 C takes keys only when they are held long enough (debounced)', () => {
  const entry = { id: 't', format: 'bin', load: '1C00', start: '1C00' };
  for (const [hold, runs] of [[30, false], [100, true]]) {
    const pmi = new Pmi80({ rom: PMIC, rom2: GAMES });
    startProgram(pmi, entry, Uint8Array.of(0x3e, 0x5a, 0x32, 0x00, 0x1d, 0x76), { bootStates: ms(50), holdStates: ms(hold), runKeys: pmi80RunKeys });
    pmi.run(ms(50));
    assert.equal(pmi.read(0x1d00) === 0x5a, runs, `keys held ${hold} ms`);
  }
});
