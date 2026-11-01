// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/asm/asm8080.js';
import { I8080_OPCODES, disassemble } from '../src/core/i8080-disasm.js';
import { I8080 } from '../src/core/i8080.js';

const bytesOf = r => r.blocks.flatMap(b => [...b.bytes]);

test('every documented opcode assembles back from its disassembly', () => {
  for (const o of I8080_OPCODES) {
    if (o.undocumented) continue;
    const mem = [o.op, 0x34, 0x12];
    const d = disassemble(a => mem[a] ?? 0, 0);
    const r = assemble(`  ${d.text}`);
    assert.deepEqual(r.errors, [], d.text);
    assert.deepEqual(bytesOf(r), d.bytes, d.text);
  }
});

test('the states in the opcode table match the core', () => {
  for (const o of I8080_OPCODES) {
    const got = [0x02, 0xd7].map(f => {
      const mem = new Uint8Array(0x10000);
      mem.set([o.op, 0x00, 0x02], 0x100);
      const cpu = new I8080({ read: a => mem[a], write: (a, v) => { mem[a] = v; }, input: () => 0, output: () => {} });
      cpu.pc = 0x100; cpu.sp = 0x8000; cpu.f = f;
      return cpu.step();
    });
    const [lo, hi] = [Math.min(...got), Math.max(...got)];
    assert.equal(o.states, lo === hi ? String(lo) : `${lo}/${hi}`, o.text);
  }
});

test('labels, ORG, EQU, DB, DW, DS and expressions', () => {
  const r = assemble(`
VIDEO   EQU 1FFCh
        ORG 1C00h
START:  LXI H,TEXT        ; forward reference
        SHLD VIDEO
        MVI A,LOW(TEXT+1)
        JMP $
TEXT:   DB 19h,'AB',0
        DW START, VIDEO-1
        DS 2
LAST:   DB HIGH(LAST)
  `);
  assert.deepEqual(r.errors, []);
  assert.equal(r.symbols.START, 0x1c00);
  assert.equal(r.symbols.TEXT, 0x1c0b);
  assert.deepEqual([...r.blocks[0].bytes], [
    0x21, 0x0b, 0x1c, 0x22, 0xfc, 0x1f, 0x3e, 0x0c, 0xc3, 0x08, 0x1c,
    0x19, 0x41, 0x42, 0x00, 0x00, 0x1c, 0xfb, 0x1f]);
  assert.deepEqual(r.blocks[1], { addr: 0x1c15, bytes: Uint8Array.from([0x1c]) });
});

test('TASM-style directives and number forms', () => {
  const r = assemble(' .org $1C00\n .db 0x10, 1010b, 0ffh, 12\nX .equ 5\n mvi b,x');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(bytesOf(r), [0x10, 0x0a, 0xff, 12, 0x06, 0x05]);
});

test('errors name the line', () => {
  const r = assemble(' ORG 0\n MOV A,Q\n JMP NOWHERE\n MVI A,300');
  assert.deepEqual(r.errors.map(e => e.line), [2, 3, 4]);
});
