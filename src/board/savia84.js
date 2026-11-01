// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Savia-84 board: U880 (Z80) at 2 MHz, 1 KiB monitor EPROM 2758, 2 KiB RAM 6116, the 8255 with
// a multiplexed display through a 74145 and a 23-key matrix. See docs/savia84.md for the sources
// of every fact used here (the book Radioamatérské konstrukce 4, its circuit diagram, the
// monitor ROM and measurements on the maintainer's board).

import { Z80 } from '../core/z80.js';
import { I8255 } from '../machine/i8255.js';
import { MuxDisplay } from '../machine/display.js';
import { EdgeRecorder } from '../machine/audio-render.js';
import { PMI80_MATRIX } from './pmi80.js';

// The book's crystal of 4 MHz divided by two, or a 2 MHz crystal without the divider (both give
// 2 MHz; the maintainer's board has the latter).
export const SAVIA84_CLOCK_HZ = 2e6;

// The 74145 drives nine digit positions (outputs 0-8); the book's build fits eight digits and
// leaves output 1 without one (its column only reads keys).
export const SAVIA84_DIGITS = 9;
export const SAVIA84_MISSING_DIGIT = 1;

// The key table of the factory monitor (03E5h) is byte for byte that of the PMI-80 and the
// matrix is wired the same way, so the keys share their names with the PMI-80 and only the
// labels differ: M is Ad, = is dA, S is -S, R is Reg. The Savia has no interrupt key.
export const SAVIA84_MATRIX = PMI80_MATRIX;

// The board's own arrangement of the keys (photo of the maintainer's board, docs/savia84.md),
// top row first, with the PMI-80 names of the keys.
export const SAVIA84_LAYOUT = Object.freeze([
  ['7', '8', '9', 'F', 'R', 'RE'],
  ['4', '5', '6', 'E', 'M', '='],
  ['1', '2', '3', 'D', 'L', 'S'],
  ['0', 'A', 'B', 'C', 'BR', 'EX'],
]);

// RAM contents seen after power on of the maintainer's Savia-84 (2026-10-24): from 1800h
// 00 FF 5C FF 7B F7 BD FF 9F FF BD FF 8C FF 77 FF 00 00 FF FB, then mostly FFh with now and
// then a different byte. The emulator starts with FFh throughout.
export const SAVIA84_POWER_ON_RAM = 0xff;

// Keys that start a program at `start` (four hex digits): the greeting SLAVIA 84 is itself the
// command prompt, so Ex, the address and dA.
export function savia84RunKeys(start) {
  return ['EX', ...start.toUpperCase(), '='];
}

export class Savia84 {
  // rom: the monitor image (the first 1 KiB is used by the book's decoder, all 2 KiB by the
  // variant); decoder: 'book' (the circuit diagram of the book) or 'nostalcomp' (the
  // simplification published by Nostalcomp: 3205 moved to A11-A13, a 2 KiB EPROM 2716);
  // ramFill: RAM contents at power on, a byte or a function of the RAM offset.
  constructor({ rom, decoder = 'book', ramFill = SAVIA84_POWER_ON_RAM } = {}) {
    this.decoder = decoder;
    this.rom = new Uint8Array(0x800).fill(0xff);
    this.rom.set(rom.subarray(0, decoder === 'book' ? 0x400 : 0x800));
    this.ram = new Uint8Array(0x800);
    for (let i = 0; i < this.ram.length; i++) this.ram[i] = typeof ramFill === 'function' ? ramFill(i) : ramFill;
    this.bus = 0xff; // last value on the data bus; nothing drives it when an empty address or port is read
    this.keys = new Set();
    this.resetHeld = false;
    this.display = new MuxDisplay(SAVIA84_DIGITS);
    this.k3 = new EdgeRecorder(0, 0); // PA7, where a speaker with an amplifier can be connected
    this.cpu = new Z80({
      read: a => this.busRead(a),
      write: (a, v) => { this.bus = v; this.write(a, v); },
      input: p => this.busIn(p),
      output: (p, v) => { this.bus = v; this.output(p, v); },
    });
    this.ppi = new I8255({
      inputC: () => this.portCInput(),
      onOutput: () => this.updateDisplay(),
    });
    this.updateDisplay();
  }

  get cycles() { return this.cpu.cycles; }

  // Memory map. A15 is not decoded, so 8000h-FFFFh mirrors 0000h-7FFFh.
  //  - book: the 3205 decodes A10-A12 into 1 KiB blocks and is enabled only while A13 and A14
  //    are 0: ROM 0000h-03FFh (block 0), RAM 1800h-1FFFh (blocks 6 and 7), nothing else;
  //  - nostalcomp: it decodes A11-A13 into 2 KiB blocks (enabled while A14 is 0, assumed): ROM
  //    0000h-07FFh (block 0), RAM 1800h-1FFFh (block 3).
  // read() is the side-effect free view for the debug API; an unpopulated address shows FFh
  // there, while the CPU gets the stale bus value (busRead).
  romOffset(addr) {
    const a = addr & 0x7fff;
    if (this.decoder === 'book') return a < 0x0400 ? a : -1;
    return a < 0x0800 ? a : -1;
  }

  ramOffset(addr) {
    const a = addr & 0x7fff;
    return a >= 0x1800 && a < 0x2000 ? a - 0x1800 : -1;
  }

  read(addr) {
    const r = this.romOffset(addr);
    if (r >= 0) return this.rom[r];
    const m = this.ramOffset(addr);
    return m >= 0 ? this.ram[m] : 0xff;
  }

  populated(addr) {
    return this.romOffset(addr) >= 0 || this.ramOffset(addr) >= 0;
  }

  // What is at an address, for the memory view: 'rom', 'ram' or 'none'.
  region(addr) {
    return this.romOffset(addr) >= 0 ? 'rom' : this.ramOffset(addr) >= 0 ? 'ram' : 'none';
  }

  // A read by the CPU. Where no chip drives the data bus the bus keeps the value of the previous
  // transfer (measured on the maintainer's board: 0400h-0488h read 7Eh in the monitor, the
  // opcode of the LD A,(HL) that reads them).
  busRead(addr) {
    if (this.populated(addr)) this.bus = this.read(addr);
    return this.bus;
  }

  write(addr, v) {
    const m = this.ramOffset(addr);
    if (m >= 0) this.ram[m] = v;
  }

  // The 8255 is selected by A2 = 0 alone (its /CS is wired to A2), A0 and A1 pick the register;
  // A3-A15 are not decoded, so it answers on many ports. Another port returns the stale bus.
  busIn(port) {
    if ((port & 0x04) === 0) this.bus = this.ppi.read(port & 3);
    return this.bus;
  }

  input(port) {
    return (port & 0x04) === 0 ? this.ppi.read(port & 3) : 0xff;
  }

  output(port, v) {
    if ((port & 0x04) === 0) this.ppi.write(port & 3, v);
  }

  // Digit (and keyboard column) selected by PC0-PC3, the index itself through the 74145.
  // Index 9 is a real decoder output with no digit; 10-15 select nothing.
  selectedColumn() {
    return this.ppi.outputC() & 0x0f;
  }

  portCInput() {
    const column = this.selectedColumn();
    let v = 0xff; // PC4-PC6 have pull-ups (6k8); PC7 is unused, read as high (assumed)
    for (const k of this.keys) {
      const m = SAVIA84_MATRIX[k];
      if (m && m[0] === column) v &= ~(1 << m[1]);
    }
    return v;
  }

  updateDisplay() {
    const pa = this.ppi.outputA();
    const column = this.selectedColumn();
    const digit = column < SAVIA84_DIGITS ? column : -1;
    this.display.set(digit, (~pa) & 0x7f, this.cpu.cycles);
    this.k3.set(pa >> 7, this.cpu.cycles);
  }

  // Level changes of PA7 since the previous call, for the virtual amplifier.
  takeAudio() {
    return this.k3.take(this.cpu.cycles);
  }

  pressKey(name) {
    if (name === 'RE') {
      this.resetHeld = true;
      this.reset();
    } else {
      this.keys.add(name);
    }
  }

  releaseKey(name) {
    if (name === 'RE') this.resetHeld = false;
    else this.keys.delete(name);
  }

  // The RESET line resets the CPU and the 8255 (all ports become inputs).
  reset() {
    this.cpu.reset();
    this.ppi.reset();
  }

  // Runs for at least `states` CPU states (whole instructions). While Reset is held the CPU
  // stays in reset and only time passes.
  run(states) {
    const end = this.cpu.cycles + states;
    if (this.resetHeld) {
      this.cpu.cycles = end;
      return;
    }
    while (this.cpu.cycles < end) this.cpu.step();
  }
}
