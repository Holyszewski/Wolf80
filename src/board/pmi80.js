// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// PMI-80 board: MHB8080A, 1 KiB monitor ROM, optional second 1 KiB EPROM, 1 KiB RAM, the system
// MHB8255A with a nine-digit multiplexed display and a 25-key keyboard. See docs/pmi80.md for the
// sources of every fact used here.

import { I8080 } from '../core/i8080.js';
import { I8255 } from '../machine/i8255.js';
import { MuxDisplay } from '../machine/display.js';
import { EdgeRecorder } from '../machine/audio-render.js';

// 10 MHz crystal divided by 9 in the MH8224 clock generator.
export const PMI80_CLOCK_HZ = 10e6 / 9;

export const PMI80_DIGITS = 9;

// RAM contents seen after power on of a real PMI-80 (the maintainer's working unit no. 1452, 2026-10-24): 44h at even and BBh at
// odd offsets, with now and then a single flipped bit (A4, B4, AB, 0B, 74, 7B, 54, C4, EB ...). The
// pattern was seen to go on through many more bytes; the flips are random and are not modelled.
export const POWER_ON_RAM = i => (i & 1 ? 0xbb : 0x44);

// Keys of the matrix: [column, input line of port C]. A column is the digit index selected on
// PC0-PC3; a pressed key pulls its line (PC4, PC5 or PC6) low while its column is selected.
// Derived from the DISP routine (0140h) and the key table at 01A3h of the factory monitor.
export const PMI80_MATRIX = Object.freeze({
  '0': [0, 6], '4': [1, 6], '8': [2, 6], 'EX': [3, 6], 'D': [4, 6],
  'C': [5, 6], '9': [6, 6], '5': [7, 6], '1': [8, 6],
  '2': [0, 5], '6': [1, 5], 'A': [2, 5], 'R': [3, 5], 'F': [4, 5],
  'E': [5, 5], 'B': [6, 5], '7': [7, 5], '3': [8, 5],
  'S': [1, 4], 'L': [2, 4], 'BR': [4, 4], 'M': [5, 4], '=': [8, 4],
});

// Keyboard as seen from the front, top row first. RE (reset) and I (interrupt) are wired to the
// hardware, not to the matrix.
export const PMI80_LAYOUT = Object.freeze([
  ['RE', 'I', 'EX', 'R', 'BR'],
  ['C', 'D', 'E', 'F', 'M'],
  ['8', '9', 'A', 'B', 'L'],
  ['4', '5', '6', '7', 'S'],
  ['0', '1', '2', '3', '='],
]);

// Keys that start a program at `start` (four hex digits) from the factory monitor right after a
// reset: any key leaves the "PMI -80" greeting, then EX, the address and =.
export function pmi80RunKeys(start) {
  return ['=', 'EX', ...start.toUpperCase(), '='];
}

export class Pmi80 {
  // rom: the 1 KiB monitor; rom2: optional second EPROM at 0400h; ramFill: RAM contents at
  // power on, a byte or a function of the RAM offset (default: POWER_ON_RAM, the pattern seen on a
  // real board; the real 2114 chips differ from unit to unit).
  constructor({ rom, rom2 = null, ramFill = POWER_ON_RAM } = {}) {
    this.rom = loadRom(rom);
    this.rom2 = rom2 ? loadRom(rom2) : null;
    this.ram = new Uint8Array(0x400);
    for (let i = 0; i < this.ram.length; i++) this.ram[i] = typeof ramFill === 'function' ? ramFill(i) : ramFill;
    this.bus = 0xff; // last value on the data bus; nothing drives it when an empty address or port is read
    this.keys = new Set();
    this.resetHeld = false;
    this.display = new MuxDisplay(PMI80_DIGITS);
    this.k3 = new EdgeRecorder(0, 0); // tape output MG OUT, the virtual amplifier's input
    this.cpu = new I8080({
      read: a => this.busRead(a),
      write: (a, v) => { this.bus = v; this.write(a, v); },
      input: p => this.busIn(p),
      output: (p, v) => { this.bus = v; this.output(p, v); },
    });
    this.cpu.intVector = 0xff; // nothing drives the data bus during INTA: RST 7
    this.ppi = new I8255({
      inputC: () => this.portCInput(),
      onOutput: () => this.updateDisplay(),
    });
    this.updateDisplay();
  }

  get cycles() { return this.cpu.cycles; }

  // Memory map. A13 is not decoded, so 2000h-3FFFh mirrors 0000h-1FFFh; from 4000h on the
  // decoder is blocked. read() is the side-effect free view for the debug API; an unpopulated
  // address shows FFh there, while the CPU gets the stale bus value (busRead).
  read(addr) {
    if (addr >= 0x4000) return 0xff;
    const a = addr & 0x1fff;
    if (a < 0x0400) return this.rom[a];
    if (a < 0x0800) return this.rom2 ? this.rom2[a - 0x0400] : 0xff;
    if (a >= 0x1c00) return this.ram[a - 0x1c00];
    return 0xff;
  }

  populated(addr) {
    if (addr >= 0x4000) return false;
    const a = addr & 0x1fff;
    return a < 0x0400 || (a < 0x0800 && this.rom2 !== null) || a >= 0x1c00;
  }

  // What is at an address, for the memory view: 'rom', 'ram' or 'none'.
  region(addr) {
    if (!this.populated(addr)) return 'none';
    return (addr & 0x1fff) >= 0x1c00 ? 'ram' : 'rom';
  }

  // A read by the CPU. Where no chip drives the data bus the bus keeps the value of the previous
  // transfer (measured: reading an empty address with MOV A,M returns 7Eh, the opcode just fetched).
  busRead(addr) {
    if (this.populated(addr)) this.bus = this.read(addr);
    return this.bus;
  }

  busIn(port) {
    if ((port & 0x0c) === 0x08) this.bus = this.ppi.read(port & 3);
    return this.bus;
  }

  write(addr, v) {
    if (addr >= 0x4000) return;
    const a = addr & 0x1fff;
    if (a >= 0x1c00) this.ram[a - 0x1c00] = v;
  }

  // The system 8255 answers on ports x8h-xBh (any upper nibble). The optional second 8255 at
  // x4h-x7h is not modelled (a board that has one reads 00h from its idle inputs); an empty port
  // returns the stale bus value, in practice the port number just fetched as the IN operand.
  input(port) {
    return (port & 0x0c) === 0x08 ? this.ppi.read(port & 3) : 0xff;
  }

  output(port, v) {
    if ((port & 0x0c) === 0x08) this.ppi.write(port & 3, v);
  }

  // Digit (and keyboard column) selected by PC0-PC3: the PMI-80 sends the inverted index.
  // Index 9 is a real decoder output with no digit; 10-15 select nothing.
  selectedColumn() {
    return (~this.ppi.outputC()) & 0x0f;
  }

  portCInput() {
    const column = this.selectedColumn();
    let v = 0xff; // PC4-PC6 have pull-ups; PC7 is the tape input, idle high (assumed)
    for (const k of this.keys) {
      const m = PMI80_MATRIX[k];
      if (m && m[0] === column) v &= ~(1 << m[1]);
    }
    return v;
  }

  updateDisplay() {
    const pa = this.ppi.outputA();
    const column = this.selectedColumn();
    const digit = column < PMI80_DIGITS ? column : -1;
    this.display.set(digit, (~pa) & 0x7f, this.cpu.cycles);
    // MG OUT on K3 is the NAND of PA6 (burst) and PA7 (data), gate IO11 pin 8.
    this.k3.set((pa & 0xc0) === 0xc0 ? 0 : 1, this.cpu.cycles);
  }

  // Level changes of MG OUT since the previous call, for the virtual amplifier.
  takeAudio() {
    return this.k3.take(this.cpu.cycles);
  }

  pressKey(name) {
    if (name === 'RE') {
      this.resetHeld = true;
      this.reset();
    } else if (name === 'I') {
      this.cpu.intLine = true;
    } else {
      this.keys.add(name);
    }
  }

  releaseKey(name) {
    if (name === 'RE') this.resetHeld = false;
    else if (name === 'I') this.cpu.intLine = false;
    else this.keys.delete(name);
  }

  // The RESET line resets the CPU and the 8255 (all ports become inputs).
  reset() {
    this.cpu.reset();
    this.ppi.reset();
  }

  // Runs for at least `states` CPU states (whole instructions). While RE is held the CPU stays
  // in reset and only time passes.
  run(states) {
    const end = this.cpu.cycles + states;
    if (this.resetHeld) {
      this.cpu.cycles = end;
      return;
    }
    while (this.cpu.cycles < end) this.cpu.step();
  }
}

function loadRom(bytes) {
  const rom = new Uint8Array(0x400).fill(0xff);
  rom.set(bytes.subarray(0, 0x400));
  return rom;
}
