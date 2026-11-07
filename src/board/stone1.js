// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Stone 1 by Radek Veselý: a single-board computer crossed from the PMI-80 and the Savia-84. Z80
// at 2 MHz, a 2 KiB EPROM 2716 at 0000h, a 2 KiB RAM 6116 at 1800h with full address decoding
// (no mirrors), the 8255 wired as on the Savia, nine digits and 25 keys as on the PMI-80: the
// digit index goes through inverters (IC9) to the 74145, and the I key drives /INT. See
// docs/stone1.md for the sources.

import { Savia84 } from './savia84.js';
import { pmi80RunKeys } from './pmi80.js';

export const STONE1_CLOCK_HZ = 2e6;

// The board's own monitor and Nostalcomp's STONE-PMI both greet and wait for any key, then take
// EX, the address and =, like the PMI-80's factory monitor.
export const stone1RunKeys = pmi80RunKeys;

// The 8255, the display, the keys, PA7 for the virtual amplifier and the stale data bus are those
// of the Savia-84 model; what differs is overridden here.
export class Stone1 extends Savia84 {
  // rom: the 2 KiB image of the 2716 (the whole of it is decoded).
  constructor({ rom, ramFill, customRom } = {}) {
    super({ rom, decoder: 'nostalcomp', ramFill, customRom });
    // nothing drives the data bus during the interrupt acknowledge; the page says that pull-ups
    // are needed for the I key, and the board's monitor expects RST 38h (assumed: FFh)
    this.cpu.intVector = 0xff;
  }

  // Full decoding by a 74LS138: the EPROM only at 0000h-07FFh, the RAM only at 1800h-1FFFh.
  romOffset(addr) {
    return addr < 0x0800 ? addr : -1;
  }

  ramOffset(addr) {
    return addr >= 0x1800 && addr < 0x2000 ? addr - 0x1800 : -1;
  }

  mirror(addr) {
    return addr;
  }

  // The index is inverted (IC9) before the 74145, as on the PMI-80: the monitors write ~E.
  selectedColumn() {
    return (~this.ppi.outputC()) & 0x0f;
  }

  pressKey(name) {
    if (name === 'I') this.cpu.intLine = true;
    else super.pressKey(name);
  }

  releaseKey(name) {
    if (name === 'I') this.cpu.intLine = false;
    else super.releaseKey(name);
  }
}
