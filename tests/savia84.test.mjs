// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// The Savia-84 board running its factory monitor ROM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Savia84, SAVIA84_CLOCK_HZ, SAVIA84_DIGITS, SAVIA84_MATRIX, SAVIA84_LAYOUT, savia84RunKeys } from '../src/board/savia84.js';
import { litMasks } from '../src/machine/display.js';
import { startProgram } from '../src/machine/programs.js';

const ROM = fs.readFileSync(new URL('../roms/savia84/savia84_monitor.bin', import.meta.url));
const ms = t => Math.round(t * SAVIA84_CLOCK_HZ / 1000);

// Segments of a character code, from the monitor's own table at 03C1h (active low).
const lit = codes => codes.map(c => (~ROM[0x3c1 + c]) & 0x7f);
const GREETING = [0x05, 0x15, 0x0a, 0x1c, 0x01, 0x0a, 0x23, 0x08, 0x04]; // S L A V I A _ 8 4

function shown(board) {
  board.display.takeFrame(board.cycles);
  board.run(ms(30));
  return litMasks(board.display.takeFrame(board.cycles), SAVIA84_DIGITS);
}

function tap(board, key) {
  board.pressKey(key);
  board.run(ms(60));
  board.releaseKey(key);
  board.run(ms(60));
}

function runCode(board, bytes, at = 0x1800) {
  bytes.forEach((v, i) => board.write(at + i, v));
  board.cpu.pc = at;
  board.cpu.sp = 0x1f80;
  for (let i = 0; i < 100000 && !board.cpu.halted; i++) board.cpu.step();
}

test('the ROM is the factory monitor, 2 KiB with an empty upper half', () => {
  const hash = crypto.createHash('sha256').update(ROM).digest('hex');
  assert.equal(hash, '3caf3ed02f7fd8bc2484bbfb48df788ef1db01a8098146f9f8bd9e8f61efd031');
  assert.equal(ROM.length, 0x800);
  assert.ok(ROM.subarray(0x400).every(v => v === 0xff));
});

test('after power on the display shows SLAVIA 84', () => {
  const s = new Savia84({ rom: ROM });
  s.run(ms(50));
  assert.deepEqual(shown(s), lit(GREETING));
});

test('every key gives its monitor code through the scan routine 0200h', () => {
  const codes = {
    0: 0x80, 1: 0x81, 2: 0x82, 3: 0x83, 4: 0x84, 5: 0x85, 6: 0x86, 7: 0x87,
    8: 0x88, 9: 0x89, A: 0x8a, B: 0x8b, C: 0x8c, D: 0x8d, E: 0x8e, F: 0x8f,
    '=': 0x90, EX: 0x91, M: 0x92, L: 0x93, S: 0x94, BR: 0x97, R: 0x9a,
  };
  assert.deepEqual(Object.keys(codes).sort(), Object.keys(SAVIA84_MATRIX).sort());
  // 1800: LD HL,1FF7h / CALL 0200h / JR NC,1800h / LD (1900h),A / HALT
  const program = [0x21, 0xf7, 0x1f, 0xcd, 0x00, 0x02, 0x30, 0xf8, 0x32, 0x00, 0x19, 0x76];
  for (const [key, code] of Object.entries(codes)) {
    const s = new Savia84({ rom: ROM });
    s.output(0xfb, 0x88);
    s.pressKey(key);
    runCode(s, program);
    const a = s.read(0x1900);
    assert.equal(((a >> 1) | (a << 7)) & 0xff, code, `key ${key}`); // returned rotated left
  }
});

test('the board layout has every matrix key and Reset', () => {
  const keys = SAVIA84_LAYOUT.flat();
  assert.equal(keys.length, 24);
  assert.deepEqual(keys.filter(k => k !== 'RE').sort(), Object.keys(SAVIA84_MATRIX).sort());
});

test('Ex, address and dA start a program; Reset returns to the greeting', () => {
  const s = new Savia84({ rom: ROM });
  const entry = { id: 't', format: 'bin', load: '1800', start: '1800' };
  startProgram(s, entry, Uint8Array.of(0x3e, 0x5a, 0x32, 0x00, 0x19, 0x76), {
    bootStates: ms(20), holdStates: ms(40), runKeys: savia84RunKeys,
  });
  s.run(ms(10));
  assert.equal(s.read(0x1900), 0x5a);
  assert.equal(s.cpu.halted, true);
  s.pressKey('RE');
  s.run(ms(20));
  assert.deepEqual(shown(s), [0, 0, 0, 0, 0, 0, 0, 0, 0]); // held in reset: dark
  s.releaseKey('RE');
  s.run(ms(50));
  assert.deepEqual(shown(s), lit(GREETING));
});

test('Ad shows memory: an address and its byte', () => {
  const s = new Savia84({ rom: ROM });
  s.run(ms(50));
  s.write(0x1810, 0xa5);
  for (const k of ['M', '1', '8', '1', '0', '=']) tap(s, k);
  const d = shown(s); // M (code 16h) for the memory mode, the address, the byte
  assert.deepEqual(d, [lit([0x16])[0], 0, ...lit([1, 8, 1, 0]), 0, ...lit([0x0a, 0x05])]);
});

test('the digit is the index itself on PC0-PC3', () => {
  const s = new Savia84({ rom: ROM });
  runCode(s, [0x3e, 0x88, 0xd3, 0xfb, 0x3e, 0x02, 0xd3, 0xfa, 0x3e, 0x40, 0xd3, 0xf8, 0x76]); // PC = 2, PA = 40h ("0")
  s.display.takeFrame(s.cycles);
  s.run(1000);
  const d = litMasks(s.display.takeFrame(s.cycles), SAVIA84_DIGITS);
  assert.deepEqual(d, [0, 0, lit([0])[0], 0, 0, 0, 0, 0, 0]);
  assert.equal(s.selectedColumn(), 2);
});

test('memory map of the book: ROM 0000h-03FFh, RAM 1800h-1FFFh, A15 ignored', () => {
  const rom = new Uint8Array(0x800).fill(0x11);
  const s = new Savia84({ rom });
  assert.equal(s.read(0x0000), 0x11);
  assert.equal(s.read(0x0400), 0xff); // the 2758 has 1 KiB; block 1 is empty
  assert.equal(s.read(0x8000), 0x11);
  s.write(0x9810, 0x5a);
  assert.equal(s.read(0x1810), 0x5a);
  assert.equal(s.populated(0x1400), false);
  assert.equal(s.populated(0x2000), false); // A13 blocks the decoder
  assert.equal(s.populated(0x5800), false); // A14 too
  assert.equal(s.read(0x1800), 0xff);       // RAM starts as FFh
  s.write(0x0000, 0);
  assert.equal(s.read(0x0000), 0x11);
});

test('memory map of Nostalcomp\'s simplification: a 2 KiB EPROM, 2 KiB blocks', () => {
  const rom = new Uint8Array(0x800).fill(0x22);
  const s = new Savia84({ rom, decoder: 'nostalcomp' });
  assert.equal(s.read(0x0400), 0x22);
  assert.equal(s.read(0x87ff), 0x22);
  assert.equal(s.populated(0x0800), false);
  assert.equal(s.populated(0x1800), true);
  assert.equal(s.populated(0x2000), false);
  assert.equal(s.populated(0x3800), false);
});

// Measured on the maintainer's board (2026-10-24): Ad 0400h ... 0488h shows 7Eh, the opcode of
// LD A,(HL) with which the monitor reads memory.
test('an empty address or port returns the last value on the data bus', () => {
  const s = new Savia84({ rom: ROM });
  // LD HL,0400h / LD A,(HL) / LD (1900h),A / IN A,(0Ch) / LD (1901h),A / HALT
  runCode(s, [0x21, 0x00, 0x04, 0x7e, 0x32, 0x00, 0x19, 0xdb, 0x0c, 0x32, 0x01, 0x19, 0x76]);
  assert.equal(s.read(0x1900), 0x7e);
  assert.equal(s.read(0x1901), 0x0c); // A2 = 1: not the 8255
});

test('the 8255 answers on every port with A2 = 0', () => {
  const s = new Savia84({ rom: ROM });
  runCode(s, [0x3e, 0x88, 0xd3, 0x0b, 0x3e, 0x5a, 0xd3, 0x00, 0xdb, 0xf8, 0x32, 0x00, 0x19, 0x76]);
  assert.equal(s.ppi.control, 0x88);
  assert.equal(s.read(0x1900), 0x5a);
});

// L jumps to 0305h, which holds FFh (RST 38h); 0038h jumps to 1FDFh in RAM, which also holds
// FFh after power on, so RST 38h repeats and every pass pushes a return address 1FE0h. The stack
// runs down through the whole address space and over the RAM (twice, A15 is not decoded) until
// 1FDFh itself is overwritten and the code that follows ends up at 0000h, about 0.3 s later.
test('L at the prompt runs into the empty tape area and comes back with the RAM overwritten', () => {
  const s = new Savia84({ rom: ROM });
  s.write(0x1810, 0x12);
  s.run(ms(50));
  s.pressKey('L');
  s.run(ms(60));
  s.releaseKey('L');
  let restart = -1;
  for (let i = 0; i < 1e6 && restart < 0; i++) {
    if (s.cpu.pc === 0) restart = s.cycles;
    s.cpu.step();
  }
  assert.ok(restart > 0, 'the monitor starts again');
  const after = (restart - ms(110)) / SAVIA84_CLOCK_HZ;
  assert.ok(after > 0.2 && after < 0.4, `after ${after.toFixed(2)} s`);
  assert.ok([0xe0, 0x1f].includes(s.read(0x1810)), 'RAM holds pushed return addresses');
  s.run(ms(50));
  assert.deepEqual(shown(s), lit(GREETING));
});

test('PA7 goes to the virtual amplifier', () => {
  const s = new Savia84({ rom: ROM });
  s.takeAudio();
  runCode(s, [0x3e, 0x88, 0xd3, 0xfb, 0x3e, 0xff, 0xd3, 0xf8, 0x3e, 0x7f, 0xd3, 0xf8, 0x76]);
  const chunk = s.takeAudio();
  assert.equal(chunk.startLevel, 1); // after reset the 8255 lines are inputs, read as high
  assert.equal(chunk.edges.length, 3); // 88h clears PA (low), then FFh (high), then 7Fh (low)
});
