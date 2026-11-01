// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Unit tests of the 8080 core against the Intel 8080 Microcomputer Systems User's Manual
// (98-153B, 1975): states from the summary on page 5-19, behaviour from chapter 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { I8080 } from '../src/core/i8080.js';

function machine(program = [], at = 0x0100) {
  const mem = new Uint8Array(0x10000);
  mem.set(program, at);
  const io = { in: new Uint8Array(256), out: [] };
  const bus = {
    read: a => mem[a],
    write: (a, v) => { mem[a] = v; },
    input: p => io.in[p],
    output: (p, v) => { io.out.push([p, v]); },
  };
  const cpu = new I8080(bus);
  cpu.pc = at;
  cpu.sp = 0x8000;
  return { cpu, mem, io };
}

// Runs a program until HLT (or a step limit) and returns the machine.
function run(program, setup = () => {}) {
  const m = machine([...program, 0x76]);
  setup(m.cpu, m.mem);
  for (let i = 0; i < 1000 && !m.cpu.halted; i++) m.cpu.step();
  return m;
}

// States per opcode, written out from the manual's summary table (page 5-19), independently of
// the core's decoder. "a/b" means: condition false / condition true. Undocumented copies take
// the states of the instruction they copy (NOP, JMP, RET, CALL).
const STATES = `
 4 10  7  5  5  5  7  4  4 10  7  5  5  5  7  4
 4 10  7  5  5  5  7  4  4 10  7  5  5  5  7  4
 4 10 16  5  5  5  7  4  4 10 16  5  5  5  7  4
 4 10 13  5 10 10 10  4  4 10 13  5  5  5  7  4
 5  5  5  5  5  5  7  5  5  5  5  5  5  5  7  5
 5  5  5  5  5  5  7  5  5  5  5  5  5  5  7  5
 5  5  5  5  5  5  7  5  5  5  5  5  5  5  7  5
 7  7  7  7  7  7  7  7  5  5  5  5  5  5  7  5
 4  4  4  4  4  4  7  4  4  4  4  4  4  4  7  4
 4  4  4  4  4  4  7  4  4  4  4  4  4  4  7  4
 4  4  4  4  4  4  7  4  4  4  4  4  4  4  7  4
 4  4  4  4  4  4  7  4  4  4  4  4  4  4  7  4
 5/11 10 10 10 11/17 11 7 11  5/11 10 10 10 11/17 17 7 11
 5/11 10 10 10 11/17 11 7 11  5/11 10 10 10 11/17 17 7 11
 5/11 10 10 18 11/17 11 7 11  5/11  5 10  4 11/17 17 7 11
 5/11 10 10  4 11/17 11 7 11  5/11  5 10  4 11/17 17 7 11
`.trim().split(/\s+/).map(s => s.split('/').map(Number));

test('every opcode takes the states given in the manual', () => {
  assert.equal(STATES.length, 256);
  for (let op = 0; op < 256; op++) {
    const expected = STATES[op];
    // With all flags clear, conditions NZ NC PO P (even CCC) are true and Z C PE M are false;
    // with all flags set it is the other way round.
    const got = [0x02, 0xd7].map(f => {
      const { cpu } = machine([op, 0x00, 0x02]);
      cpu.f = f;
      cpu.hl = 0x4000;
      return cpu.step();
    });
    const isConditional = expected.length === 2;
    if (isConditional) {
      const ccc = (op >> 3) & 7;
      const whenFalse = (ccc & 1) === 0 ? got[1] : got[0];
      const whenTrue = (ccc & 1) === 0 ? got[0] : got[1];
      assert.deepEqual([whenFalse, whenTrue], expected, `opcode ${op.toString(16)}`);
    } else {
      assert.deepEqual(got, [expected[0], expected[0]], `opcode ${op.toString(16)}`);
    }
  }
});

test('the flag byte keeps bit 1 set and bits 3 and 5 clear', () => {
  const { cpu, mem } = run([0xf5], c => { c.f = 0xff; c.a = 0x12; }); // PUSH PSW
  assert.equal(mem[0x7ffe], 0xd7);
  assert.equal(mem[0x7fff], 0x12);
  const r = run([0xf1], (c, m) => { m[0x8000] = 0x28; m[0x8001] = 0x34; }); // POP PSW
  assert.equal(r.cpu.f, 0x02);
  assert.equal(r.cpu.a, 0x34);
  assert.equal(cpu.cycles, 11 + 7);
});

test('ADD sets carry, auxiliary carry, zero and parity', () => {
  // 2E + 74 = A2: AC from bit 3, S set, P odd (manual example, ADD).
  let { cpu } = run([0x80], c => { c.a = 0x2e; c.b = 0x74; });
  assert.equal(cpu.a, 0xa2);
  assert.deepEqual([cpu.fCY, cpu.fAC, cpu.fZ, cpu.fS, cpu.fP], [false, true, false, true, false]);
  ({ cpu } = run([0x87], c => { c.a = 0x80; })); // ADD A: 80 + 80
  assert.equal(cpu.a, 0x00);
  assert.deepEqual([cpu.fCY, cpu.fZ, cpu.fP], [true, true, true]);
});

test('SUB A clears A and the carry and sets AC (manual example)', () => {
  const { cpu } = run([0x97], c => { c.a = 0x3e; c.fCY = true; });
  assert.equal(cpu.a, 0);
  assert.deepEqual([cpu.fCY, cpu.fAC, cpu.fZ, cpu.fP, cpu.fS], [false, true, true, true, false]);
});

test('SBB and CMP borrow correctly', () => {
  let { cpu } = run([0x9d], c => { c.a = 0x04; c.l = 0x02; c.fCY = true; }); // SBB L
  assert.equal(cpu.a, 0x01);
  assert.equal(cpu.fCY, false);
  ({ cpu } = run([0xbb], c => { c.a = 0x02; c.e = 0x05; })); // CMP E: A < E
  assert.equal(cpu.a, 0x02);
  assert.deepEqual([cpu.fCY, cpu.fZ], [true, false]);
  ({ cpu } = run([0xfe, 0x02], c => { c.a = 0x02; })); // CPI 02
  assert.deepEqual([cpu.fCY, cpu.fZ], [false, true]);
});

test('ANA sets AC from bit 3 of the operands; XRA and ORA clear it', () => {
  let { cpu } = run([0xa1], c => { c.a = 0x08; c.c = 0x00; c.fCY = true; }); // ANA C
  assert.deepEqual([cpu.a, cpu.fAC, cpu.fCY], [0x00, true, false]);
  ({ cpu } = run([0xa1], c => { c.a = 0xf0; c.c = 0x37; }));
  assert.deepEqual([cpu.a, cpu.fAC], [0x30, false]);
  ({ cpu } = run([0xaf], c => { c.a = 0x5a; c.fAC = true; c.fCY = true; })); // XRA A
  assert.deepEqual([cpu.a, cpu.fAC, cpu.fCY, cpu.fZ], [0, false, false, true]);
});

test('INR and DCR keep the carry and set AC', () => {
  let { cpu } = run([0x0c], c => { c.c = 0x0f; c.fCY = true; }); // INR C
  assert.deepEqual([cpu.c, cpu.fAC, cpu.fCY], [0x10, true, true]);
  ({ cpu } = run([0x35], (c, m) => { c.hl = 0x3a7c; m[0x3a7c] = 0x40; })); // DCR M
  assert.equal(cpu.bus.read(0x3a7c), 0x3f);
  assert.equal(cpu.fAC, false);
  ({ cpu } = run([0x3d], c => { c.a = 0x01; })); // DCR A
  assert.deepEqual([cpu.a, cpu.fZ, cpu.fAC], [0, true, true]);
});

test('DAA follows the manual example', () => {
  // A = 9B, both carries clear: 9B + 06 = A1 (AC), then A1 + 60 = 01 with carry.
  const { cpu } = run([0x27], c => { c.a = 0x9b; c.fCY = false; c.fAC = false; });
  assert.equal(cpu.a, 0x01);
  assert.deepEqual([cpu.fCY, cpu.fAC], [true, true]);
});

test('rotates move bits through the carry', () => {
  let { cpu } = run([0x07], c => { c.a = 0xf2; }); // RLC
  assert.deepEqual([cpu.a, cpu.fCY], [0xe5, true]);
  ({ cpu } = run([0x0f], c => { c.a = 0xf2; })); // RRC
  assert.deepEqual([cpu.a, cpu.fCY], [0x79, false]);
  ({ cpu } = run([0x17], c => { c.a = 0xb5; c.fCY = false; })); // RAL
  assert.deepEqual([cpu.a, cpu.fCY], [0x6a, true]);
  ({ cpu } = run([0x1f], c => { c.a = 0x6a; c.fCY = true; })); // RAR
  assert.deepEqual([cpu.a, cpu.fCY], [0xb5, false]);
});

test('DAD, XCHG, XTHL, SHLD and LHLD', () => {
  let { cpu } = run([0x09], c => { c.bc = 0x339f; c.hl = 0xa17b; }); // DAD B
  assert.deepEqual([cpu.hl, cpu.fCY], [0xd51a, false]);
  ({ cpu } = run([0x29], c => { c.hl = 0x8001; })); // DAD H
  assert.deepEqual([cpu.hl, cpu.fCY], [0x0002, true]);
  ({ cpu } = run([0xeb], c => { c.de = 0x1234; c.hl = 0xabcd; }));
  assert.deepEqual([cpu.de, cpu.hl], [0xabcd, 0x1234]);
  const m = run([0xe3], (c, mem) => { c.sp = 0x10ad; c.hl = 0x0b3c; mem[0x10ad] = 0xf0; mem[0x10ae] = 0x0d; });
  assert.equal(m.cpu.hl, 0x0df0);
  assert.deepEqual([m.mem[0x10ad], m.mem[0x10ae]], [0x3c, 0x0b]);
  const n = run([0x22, 0x0a, 0x01, 0x2a, 0x0a, 0x01], c => { c.hl = 0xae29; });
  assert.deepEqual([n.mem[0x010a], n.mem[0x010b]], [0x29, 0xae]);
  assert.equal(n.cpu.hl, 0xae29);
});

test('CALL, RET, conditional jumps and RST use the stack', () => {
  // 0100 CALL 0108 / 0103 HLT ... 0108 MVI A,55 / RET
  const { cpu, mem } = machine([0xcd, 0x08, 0x01, 0x76, 0, 0, 0, 0, 0x3e, 0x55, 0xc9]);
  while (!cpu.halted) cpu.step();
  assert.equal(cpu.a, 0x55);
  assert.equal(cpu.sp, 0x8000);
  assert.deepEqual([mem[0x7ffe], mem[0x7fff]], [0x03, 0x01]);
  const r = run([0xff], (c, mem) => { mem[0x0038] = 0x76; }); // RST 7, HLT at 0038
  assert.equal(r.cpu.pc, 0x0039);
  assert.deepEqual([r.mem[0x7ffe], r.mem[0x7fff]], [0x01, 0x01]);
  const j = run([0xca, 0x07, 0x01, 0xc2, 0x07, 0x01, 0x76, 0x3e, 0x01], c => { c.fZ = false; });
  assert.equal(j.cpu.a, 0x01); // JZ not taken, JNZ taken to 0107
});

test('IN and OUT talk to the bus', () => {
  const { io } = run([0xdb, 0xfa, 0xd3, 0xf8]);
  assert.deepEqual(io.out, [[0xf8, 0x00]]);
  const m = machine([0xdb, 0xf9, 0xd3, 0xfb, 0x76]);
  m.io.in[0xf9] = 0x5a;
  while (!m.cpu.halted) m.cpu.step();
  assert.deepEqual(m.io.out, [[0xfb, 0x5a]]);
});

test('undocumented opcodes act as their documented copies', () => {
  for (const op of [0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38]) {
    const { cpu } = machine([op]);
    const before = cpu.getState();
    cpu.step();
    assert.equal(cpu.pc, 0x0101);
    assert.deepEqual({ ...cpu.getState(), pc: 0, cycles: 0 }, { ...before, pc: 0, cycles: 0 });
  }
  let { cpu } = machine([0xcb, 0x34, 0x12]);
  cpu.step();
  assert.equal(cpu.pc, 0x1234);
  for (const op of [0xdd, 0xed, 0xfd]) {
    ({ cpu } = machine([op, 0x00, 0x20]));
    cpu.step();
    assert.deepEqual([cpu.pc, cpu.sp], [0x2000, 0x7ffe]);
  }
  const m = machine([0xd9]);
  m.mem[0x8000] = 0x78; m.mem[0x8001] = 0x56;
  m.cpu.step();
  assert.equal(m.cpu.pc, 0x5678);
});

test('EI enables interrupts only after the next instruction', () => {
  // EI / NOP / NOP with INT held: the interrupt is taken after the first NOP.
  const { cpu } = machine([0xfb, 0x00, 0x00]);
  cpu.intLine = true;
  cpu.step(); // EI
  assert.equal(cpu.pc, 0x0101);
  cpu.step(); // NOP runs, interrupts still blocked
  assert.equal(cpu.pc, 0x0102);
  const states = cpu.step(); // INTA with RST 7
  assert.equal(states, 11);
  assert.deepEqual([cpu.pc, cpu.inte], [0x0038, false]);
});

test('an interrupt ends a halt and returns after the HLT', () => {
  const { cpu, mem } = machine([0xfb, 0x76, 0x00]);
  cpu.step(); // EI
  cpu.step(); // HLT
  assert.equal(cpu.halted, true);
  assert.equal(cpu.step(), 4); // halted, no interrupt yet
  cpu.intLine = true;
  cpu.step();
  assert.deepEqual([cpu.halted, cpu.pc], [false, 0x0038]);
  assert.deepEqual([mem[0x7ffe], mem[0x7fff]], [0x02, 0x01]);
});

test('reset clears PC and INTE and keeps the registers', () => {
  const { cpu } = machine();
  cpu.a = 0x42; cpu.pc = 0x1234; cpu.inte = true; cpu.halted = true;
  cpu.reset();
  assert.deepEqual([cpu.a, cpu.pc, cpu.inte, cpu.halted], [0x42, 0, false, false]);
});
