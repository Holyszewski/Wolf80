// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Unit tests of the Z80 core and its disassembler. States come from the Zilog Z80 CPU User
// Manual (UM0080); the flags are covered in full by ZEXDOC and ZEXALL (tests/cpu-programs.test.mjs
// and tools/cpu-exercise.mjs --z80).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Z80 } from '../src/core/z80.js';
import { Z80_OPCODES, Z80_MAIN_OPCODES, disassembleZ80 } from '../src/core/z80-disasm.js';

function machine(program = [], at = 0x0100) {
  const mem = new Uint8Array(0x10000);
  mem.set(program, at);
  const io = { in: p => p & 0xff, out: [] };
  const bus = {
    read: a => mem[a],
    write: (a, v) => { mem[a] = v; },
    input: p => io.in(p),
    output: (p, v) => { io.out.push([p, v]); },
  };
  const cpu = new Z80(bus);
  cpu.pc = at;
  cpu.sp = 0x8000;
  return { cpu, mem, io };
}

// Runs a program until HALT (or a step limit) and returns the machine.
function run(program, setup = () => {}) {
  const m = machine([...program, 0x76]);
  setup(m.cpu, m.mem);
  for (let i = 0; i < 1000 && !m.cpu.halted; i++) m.cpu.step();
  return m;
}

// States of the unprefixed opcodes, written out from the manual independently of the core and
// the disassembler. "a/b": condition false / condition true; "-" a prefix.
const MAIN_STATES = `
 4 10  7  6  4  4  7  4  4 11  7  6  4  4  7  4
 8/13 10 7 6 4 4 7 4 12 11 7 6 4 4 7 4
 7/12 10 16 6 4 4 7 4 7/12 11 16 6 4 4 7 4
 7/12 10 13 6 11 11 10 4 7/12 11 13 6 4 4 7 4
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 7 7 7 7 7 7 4 7 4 4 4 4 4 4 7 4
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 5/11 10 10 10 10/17 11 7 11 5/11 10 10 - 10/17 17 7 11
 5/11 10 10 11 10/17 11 7 11 5/11 4 10 11 10/17 - 7 11
 5/11 10 10 19 10/17 11 7 11 5/11 4 10 4 10/17 - 7 11
 5/11 10 10 4 10/17 11 7 11 5/11 6 10 4 10/17 - 7 11
`.trim().split(/\s+/);

// The states one instruction takes in two setups chosen so that every condition is once false
// and once true (flags all clear / all set; B and BC such that DJNZ and the repeating block
// instructions once go on and once stop).
function statesOf(bytes) {
  const seen = new Set();
  for (const s of [{ f: 0x00, b: 0, c: 1 }, { f: 0xff, b: 1, c: 0 }]) {
    const m = machine([...bytes, 0, 0, 0]);
    Object.assign(m.cpu, s, { a: 0x55, h: 0x80, l: 0x00, d: 0x90, e: 0x00 });
    m.cpu.ix = 0x8000; m.cpu.iy = 0x8000;
    seen.add(m.cpu.step());
  }
  return [...seen].sort((x, y) => x - y).join('/');
}

const expectStates = text => text.split('/').map(Number).sort((x, y) => x - y).join('/');
const codeBytes = code => code.split(' ').map(b => (b === 'd' ? 0x00 : parseInt(b, 16)));

test('unprefixed opcodes take the states given in the manual', () => {
  assert.equal(MAIN_STATES.length, 256);
  for (let op = 0; op < 256; op++) {
    if (MAIN_STATES[op] === '-') continue;
    const label = `opcode ${op.toString(16)}`;
    assert.equal(statesOf([op]), expectStates(MAIN_STATES[op]), label);
    assert.equal(expectStates(Z80_MAIN_OPCODES[op].states), expectStates(MAIN_STATES[op]), `table, ${label}`);
  }
});

test('every listed opcode takes the states of the opcode table', () => {
  for (const o of Z80_OPCODES) {
    assert.equal(statesOf(codeBytes(o.code)), expectStates(o.states), `${o.code} ${o.text}`);
  }
});

test('prefixed states from the manual', () => {
  const cases = {
    'DD 21 00 00': 14, 'DD 7E 00': 19, 'DD 36 00 00': 19, 'DD 34 00': 23, 'DD 86 00': 19,
    'DD E3': 23, 'DD E9': 8, 'DD F9': 10, 'DD E5': 15, 'DD E1': 14, 'DD 09': 15, 'DD 23': 10,
    'DD CB 00 46': 20, 'DD CB 00 06': 23, 'DD CB 00 C6': 23, 'CB 00': 8, 'CB 06': 15, 'CB 46': 12,
    'ED 44': 8, 'ED 4A': 15, 'ED 43 00 00': 20, 'ED 78': 12, 'ED 79': 12, 'ED 6F': 18, 'ED 57': 9,
    'ED 45': 14, 'ED 56': 8, 'ED A0': 16, 'DD 00': 8, 'DD DD 21 00 00': 18,
  };
  for (const [code, states] of Object.entries(cases)) {
    const m = machine(codeBytes(code));
    m.cpu.b = 0; m.cpu.c = 1;
    assert.equal(m.cpu.step(), states, code);
  }
});

test('the listing covers the documented instruction set', () => {
  const documented = Z80_OPCODES.filter(o => !o.undocumented).length;
  // 252 unprefixed (without the four prefixes), 248 CB (without SLL), 58 ED + 4 block x 4,
  // DD and FD each 33 + 28 CB forms with (IX+d)
  assert.equal(Z80_OPCODES.filter(o => o.code.length === 2 && !o.undocumented).length, 252);
  assert.equal(Z80_OPCODES.filter(o => o.code.startsWith('CB') && !o.undocumented).length, 248);
  assert.ok(documented > 600, `${documented}`);
});

test('LD, arithmetic and flags', () => {
  const m = run([0x3e, 0x7f, 0xc6, 0x01]); // LD A,7Fh; ADD A,1
  assert.equal(m.cpu.a, 0x80);
  assert.equal(m.cpu.f & 0xd7, 0x80 | 0x10 | 0x04); // S, H, overflow (P/V)
  const n = run([0x3e, 0x01, 0xed, 0x44]); // NEG
  assert.equal(n.cpu.a, 0xff);
  assert.equal(n.cpu.f & 0x13, 0x13); // H, N, C
  const d = run([0x3e, 0x15, 0xc6, 0x27, 0x27]); // 15 + 27 = 42 (BCD) with DAA
  assert.equal(d.cpu.a, 0x42);
  const s = run([0x3e, 0x42, 0xd6, 0x15, 0x27]); // 42 - 15 = 27 (BCD) with DAA after SUB
  assert.equal(s.cpu.a, 0x27);
});

test('parity and overflow share one flag', () => {
  const m = run([0x3e, 0x03, 0xe6, 0x03]); // AND 3: result 03, even parity
  assert.ok(m.cpu.f & 0x04);
  const n = run([0x3e, 0x03, 0xc6, 0x00]); // ADD 0: no overflow, P/V clear despite even parity
  assert.equal(n.cpu.f & 0x04, 0);
});

test('index registers with displacement and their halves', () => {
  const m = run([
    0xdd, 0x21, 0x00, 0x90, // LD IX,9000h
    0xdd, 0x36, 0xfe, 0x5a, // LD (IX-2),5Ah
    0xdd, 0x7e, 0xfe,       // LD A,(IX-2)
    0xdd, 0x26, 0x12,       // LD IXH,12h
    0xdd, 0x65,             // LD IXH,IXL
  ]);
  assert.equal(m.mem[0x8ffe], 0x5a);
  assert.equal(m.cpu.a, 0x5a);
  assert.equal(m.cpu.ix, 0x0000);
  const n = run([0xfd, 0x21, 0x00, 0x90, 0xfd, 0x66, 0x01], (cpu, mem) => { mem[0x9001] = 0x77; }); // LD H,(IY+1)
  assert.equal(n.cpu.h, 0x77);
  assert.equal(n.cpu.iy, 0x9000);
});

test('DD CB with a register copy and BIT on memory', () => {
  const m = run([0xdd, 0x21, 0x00, 0x90, 0xdd, 0xcb, 0x01, 0xc0], (cpu, mem) => { mem[0x9001] = 0x10; }); // SET 0,(IX+1),B
  assert.equal(m.mem[0x9001], 0x11);
  assert.equal(m.cpu.b, 0x11);
  const n = run([0x21, 0x00, 0x90, 0xcb, 0x7e], (cpu, mem) => { mem[0x9000] = 0x80; }); // BIT 7,(HL)
  assert.equal(n.cpu.f & 0xc0, 0x80); // S set, Z clear
});

test('block transfer and compare', () => {
  const m = run([0x21, 0x00, 0x90, 0x11, 0x00, 0xa0, 0x01, 0x03, 0x00, 0xed, 0xb0], (cpu, mem) => mem.set([1, 2, 3], 0x9000)); // LDIR
  assert.deepEqual([...m.mem.subarray(0xa000, 0xa003)], [1, 2, 3]);
  assert.equal(m.cpu.bc, 0);
  assert.equal(m.cpu.hl, 0x9003);
  const n = run([0x21, 0x00, 0x90, 0x01, 0x10, 0x00, 0x3e, 0x03, 0xed, 0xb1], (cpu, mem) => mem.set([1, 2, 3, 4], 0x9000)); // CPIR for 3
  assert.equal(n.cpu.hl, 0x9003);
  assert.equal(n.cpu.bc, 0x000d);
  assert.ok(n.cpu.f & 0x40);
});

test('ports are 16 bits wide', () => {
  const m = run([0x3e, 0x12, 0xd3, 0xf8, 0x01, 0xfa, 0x34, 0x3e, 0x56, 0xed, 0x79]); // OUT (F8h),A; OUT (C),A
  assert.deepEqual(m.io.out, [[0x12f8, 0x12], [0x34fa, 0x56]]);
});

test('EX, EXX and the alternate registers', () => {
  const m = run([0x3e, 0x11, 0x08, 0x3e, 0x22, 0x01, 0x34, 0x12, 0xd9, 0x01, 0x78, 0x56, 0xd9]);
  assert.equal(m.cpu.a, 0x22);
  assert.equal(m.cpu.a2, 0x11);
  assert.equal(m.cpu.bc, 0x1234);
  assert.equal((m.cpu.b2 << 8) | m.cpu.c2, 0x5678);
});

test('R counts opcode fetches, prefixes included', () => {
  const m = run([0x00, 0xdd, 0x21, 0x00, 0x00, 0xcb, 0x00, 0xdd, 0xcb, 0x00, 0x06, 0xed, 0x5f]); // ... LD A,R
  // NOP 1, DD 21 2, CB 00 2, DD CB d op 2, ED 5F 2 (A is read after the second fetch)
  assert.equal(m.cpu.a, 9);
});

test('interrupt mode 1 and the EI delay', () => {
  const m = machine([0xed, 0x56, 0xfb, 0x00, 0x00]); // IM 1, EI, NOP, NOP
  m.cpu.intLine = true;
  m.cpu.step(); m.cpu.step(); // IM 1, EI
  m.cpu.step(); // the instruction after EI still runs
  assert.equal(m.cpu.pc, 0x0104);
  assert.equal(m.cpu.step(), 13);
  assert.equal(m.cpu.pc, 0x0038);
  assert.equal(m.cpu.iff1, false);
  assert.equal(m.mem[0x7ffe] | (m.mem[0x7fff] << 8), 0x0104);
});

test('interrupt mode 2 and mode 0 with RST 38h from the bus', () => {
  const m = machine([0xed, 0x5e, 0xfb, 0x00]); // IM 2, EI, NOP
  m.cpu.i = 0x90;
  m.cpu.intVector = 0x20;
  m.mem[0x9020] = 0x34; m.mem[0x9021] = 0x12;
  m.cpu.intLine = true;
  m.cpu.step(); m.cpu.step(); m.cpu.step();
  assert.equal(m.cpu.step(), 19);
  assert.equal(m.cpu.pc, 0x1234);
  const n = machine([0xfb, 0x00]); // IM 0 after reset
  n.cpu.intLine = true;
  n.cpu.step(); n.cpu.step();
  assert.equal(n.cpu.step(), 13);
  assert.equal(n.cpu.pc, 0x0038);
});

test('HALT waits for an interrupt and NMI keeps IFF2', () => {
  const m = machine([0xfb, 0x76]); // EI, HALT
  m.cpu.step(); m.cpu.step();
  assert.equal(m.cpu.halted, true);
  assert.equal(m.cpu.step(), 4);
  m.cpu.nmi();
  assert.equal(m.cpu.step(), 11);
  assert.equal(m.cpu.pc, 0x0066);
  assert.equal(m.cpu.halted, false);
  assert.equal(m.cpu.iff1, false);
  assert.equal(m.cpu.iff2, true);
  assert.equal(m.mem[0x7ffe] | (m.mem[0x7fff] << 8), 0x0102); // back after the HALT
});

test('reset keeps the registers and clears PC, I, R and the interrupt state', () => {
  const m = run([0x3e, 0x99, 0xed, 0x47, 0xed, 0x5e, 0xfb]);
  m.cpu.reset();
  assert.equal(m.cpu.pc, 0);
  assert.equal(m.cpu.a, 0x99);
  assert.equal(m.cpu.i, 0);
  assert.equal(m.cpu.im, 0);
  assert.equal(m.cpu.iff1, false);
  assert.equal(m.cpu.halted, false);
});

test('disassembler', () => {
  const dis = bytes => disassembleZ80(a => bytes[a] ?? 0, 0).text;
  assert.equal(dis([0x21, 0x00, 0x1c]), 'LD HL,1C00h');
  assert.equal(dis([0xdd, 0x36, 0xfe, 0x5a]), 'LD (IX-02h),5Ah');
  assert.equal(dis([0xfd, 0xcb, 0x05, 0x46]), 'BIT 0,(IY+05h)');
  assert.equal(dis([0x20, 0xfe]), 'JR NZ,0000h');
  assert.equal(dis([0xed, 0xb0]), 'LDIR');
  assert.equal(dis([0xd3, 0xf8]), 'OUT (F8h),A');
  assert.equal(dis([0xcb, 0x36]), 'SLL (HL)');
  assert.equal(dis([0xdd, 0x00]), 'NOP (DDh prefix)');
  assert.equal(disassembleZ80(a => [0xdd, 0xcb, 0x01, 0x06][a] ?? 0, 0).length, 4);
});
