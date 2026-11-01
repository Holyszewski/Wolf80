// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Intel 8255 programmable peripheral interface (TESLA MHB8255A), mode 0 only.
//
// Reference: Intel 8080 Microcomputer Systems User's Manual, 98-153B, 1975, "Silicon Gate MOS
// 8255" (PDF pages 183-190): RESET puts all 24 lines into input mode; every mode change clears
// all output registers; a control word with bit 7 = 0 sets or resets one bit of port C.
// Modes 1 and 2 (handshaking) are not used by the PMI-80 or the Savia and are treated as mode 0.
//
// The board supplies the input levels and is told when the outputs change:
//   new I8255({ inputA(), inputB(), inputC(), onOutput() })
// inputX() returns the pin levels of that port (bits of output lines are ignored). A line in
// input mode is not driven; outputA()/outputB()/outputC() report it as 1 (pulled up).

export class I8255 {
  constructor(io = {}) {
    this.io = {};
    this.reset(); // without notifying: the board is still being built
    this.io = io;
  }

  reset() {
    this.control = 0x9b; // mode 0, all ports input
    this.latchA = 0;
    this.latchB = 0;
    this.latchC = 0;
    this.changed();
  }

  // Direction masks: a set bit is an output line.
  get dirA() { return (this.control & 0x10) ? 0x00 : 0xff; }
  get dirB() { return (this.control & 0x02) ? 0x00 : 0xff; }
  get dirC() { return ((this.control & 0x08) ? 0x00 : 0xf0) | ((this.control & 0x01) ? 0x00 : 0x0f); }

  // Levels on the output pins as seen by the board (lines in input mode read as 1).
  outputA() { return (this.latchA & this.dirA) | (~this.dirA & 0xff); }
  outputB() { return (this.latchB & this.dirB) | (~this.dirB & 0xff); }
  outputC() { return (this.latchC & this.dirC) | (~this.dirC & 0xff); }

  // reg: 0 PA, 1 PB, 2 PC, 3 control (address lines A1 A0).
  read(reg) {
    switch (reg & 3) {
      case 0: return this.merge(this.latchA, this.dirA, this.io.inputA);
      case 1: return this.merge(this.latchB, this.dirB, this.io.inputB);
      case 2: return this.merge(this.latchC, this.dirC, this.io.inputC);
      default: return 0xff; // the control word cannot be read back
    }
  }

  merge(latch, dir, input) {
    const pins = input ? input() & 0xff : 0xff;
    return (latch & dir) | (pins & ~dir & 0xff);
  }

  write(reg, v) {
    v &= 0xff;
    switch (reg & 3) {
      case 0: this.latchA = v; break;
      case 1: this.latchB = v; break;
      case 2: this.latchC = v; break;
      default:
        if (v & 0x80) { // mode set: clears all output registers
          this.control = v;
          this.latchA = 0;
          this.latchB = 0;
          this.latchC = 0;
        } else { // bit set/reset of port C
          const bit = 1 << ((v >> 1) & 7);
          this.latchC = (v & 1) ? (this.latchC | bit) : (this.latchC & ~bit & 0xff);
        }
    }
    this.changed();
  }

  changed() {
    if (this.io.onOutput) this.io.onOutput();
  }
}
