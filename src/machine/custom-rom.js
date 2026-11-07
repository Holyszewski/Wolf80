// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// A custom ROM: an image the user loads (Intel HEX or BIN) that a board reads in place of its own
// ROM wherever the image has a byte, and in unpopulated areas as an extra EPROM that the real
// board does not have. Bytes meant for RAM are left out. The image is kept at the addresses the
// board's decoder sees (mirror()), so it shows in every mirror of them, as a real chip would.

export class CustomRom {
  // blocks: [{ addr, bytes }]; mirror(addr): the address the decoder sees; region(addr): 'rom',
  // 'ram' or 'none' on the board without the custom ROM. A later block wins where blocks overlap.
  constructor(blocks, mirror, region) {
    this.mirror = mirror;
    this.bytes = new Uint8Array(0x10000);
    this.mask = new Uint8Array(0x10000);
    // what each byte landed on: 1 over the ROM, 2 in an empty area, 3 left out (RAM)
    const kind = new Uint8Array(0x10000);
    for (const { addr, bytes } of blocks) {
      for (let i = 0; i < bytes.length && addr + i <= 0xffff; i++) {
        const a = mirror(addr + i);
        const r = region(a);
        kind[a] = r === 'ram' ? 3 : r === 'rom' ? 1 : 2;
        if (r !== 'ram') { this.bytes[a] = bytes[i]; this.mask[a] = 1; }
      }
    }
    const spans = k => {
      const out = [];
      for (let a = 0; a <= 0xffff; a++) {
        if (kind[a] !== k) continue;
        const last = out[out.length - 1];
        if (last && last.to === a - 1) last.to = a;
        else out.push({ from: a, to: a });
      }
      return out;
    };
    // the address ranges, as the decoder sees them, for the user
    this.overRom = spans(1);
    this.empty = spans(2);
    this.leftOut = spans(3);
    this.size = this.mask.reduce((n, v) => n + v, 0);
  }

  covers(addr) { return this.mask[this.mirror(addr)] === 1; }

  at(addr) { return this.bytes[this.mirror(addr)]; }

  // the first address the image covers, or -1
  get start() { return this.mask.indexOf(1); }
}
