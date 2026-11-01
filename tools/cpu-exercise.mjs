// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Runs a CP/M .COM CPU test program on the 8080 core (TST8080, 8080PRE, CPUTEST, 8080EXM) or,
// with --z80, on the Z80 core (ZEXDOC, ZEXALL).
//   node tools/cpu-exercise.mjs third_party/cpu-tests/TST8080.COM
//   node tools/cpu-exercise.mjs --z80 third_party/cpu-tests/zexdoc.com
// The test programs are third-party files and are not part of the repository (see
// third_party/README.md). Only the two CP/M BDOS calls they use are emulated: 2 (print the
// character in E) and 9 (print the string at DE up to '$'). A jump to 0000 ends the run.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { I8080 } from '../src/core/i8080.js';
import { Z80 } from '../src/core/z80.js';

const BDOS = 0xfe00;

export function runCom(bytes, { maxStates = 1e12, onText = () => {}, Cpu = I8080 } = {}) {
  const mem = new Uint8Array(0x10000);
  mem.set(bytes, 0x0100);
  mem[0x0005] = 0xc3; mem[0x0006] = BDOS & 0xff; mem[0x0007] = BDOS >> 8; // JMP BDOS
  mem[BDOS] = 0xc9; // RET
  const bus = {
    read: a => mem[a],
    write: (a, v) => { mem[a] = v; },
    input: () => 0xff,
    output: () => {},
  };
  const cpu = new Cpu(bus);
  cpu.pc = 0x0100;
  cpu.sp = BDOS;
  let text = '';
  let instructions = 0;
  while (cpu.cycles < maxStates) {
    if (cpu.pc === 0x0000) break;
    if (cpu.pc === BDOS) {
      let out = '';
      if (cpu.c === 2) {
        out = String.fromCharCode(cpu.e);
      } else if (cpu.c === 9) {
        for (let a = cpu.de; mem[a] !== 0x24; a = (a + 1) & 0xffff) out += String.fromCharCode(mem[a]);
      }
      text += out;
      if (out) onText(out);
    }
    if (cpu.halted) break;
    cpu.step();
    instructions++;
  }
  return { text, states: cpu.cycles, instructions, halted: cpu.halted, pc: cpu.pc };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const z80 = args[0] === '--z80';
  const file = args[z80 ? 1 : 0];
  if (!file) {
    console.error('usage: node tools/cpu-exercise.mjs [--z80] <program.COM>');
    process.exit(2);
  }
  const t0 = Date.now();
  const r = runCom(fs.readFileSync(file), { onText: s => process.stdout.write(s), Cpu: z80 ? Z80 : I8080 });
  const seconds = (Date.now() - t0) / 1000;
  console.log(`\n--- ${r.instructions} instructions, ${r.states} states, ${seconds.toFixed(1)} s` +
    (r.halted ? `, halted at ${r.pc.toString(16)}` : ''));
}
