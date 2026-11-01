// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Zilog Z80 CPU core. The Savia-84 uses the U880, an East German clone of the Z80; the STONE
// computer a Z80.
//
// References: Zilog Z80 CPU User Manual (UM0080), for the instruction set and the number of
// states (T-cycles) of every instruction; Sean Young, "The Undocumented Z80 Documented"
// (version 0.91, 2005), for the undocumented instructions, the flag bits 3 and 5 and the
// internal MEMPTR register. Like the 8080 core it is instruction-level: step() runs one whole
// instruction (with all its prefixes) and returns its states; the machine cycles inside an
// instruction are not modelled.
//
// The bus is an object supplied by the machine:
//   read(addr) -> byte, write(addr, byte), input(port) -> byte, output(port, byte).
// Ports are 16 bits wide, as the Z80 puts them on the address bus: IN A,(n) and OUT (n),A
// send A in the upper byte, the (C) forms send B. A board decodes only the bits it wires.
// During step() the `cycles` counter still holds the time at the start of the instruction.

// Bits of the flag register F: S Z Y H X P/V N C (Y and X are copies of result bits 5 and 3).
export const Z80_FLAGS = Object.freeze({ C: 0x01, N: 0x02, PV: 0x04, X: 0x08, H: 0x10, Y: 0x20, Z: 0x40, S: 0x80 });
const FC = 0x01, FN = 0x02, FP = 0x04, FX = 0x08, FH = 0x10, FY = 0x20, FZ = 0x40, FS = 0x80;
const FXY = FX | FY;

// SZ[v]: S, Z, Y and X of a result v; SZP[v] adds the parity (P/V set for even parity).
const SZ = new Uint8Array(256);
const SZP = new Uint8Array(256);
for (let v = 0; v < 256; v++) {
  let bits = 0;
  for (let b = v; b; b >>= 1) bits += b & 1;
  SZ[v] = (v & (FS | FXY)) | (v === 0 ? FZ : 0);
  SZP[v] = SZ[v] | ((bits & 1) ? 0 : FP);
}

const sbyte = v => (v & 0x80 ? v - 0x100 : v);

export class Z80 {
  constructor(bus) {
    this.bus = bus;
    // After power on the registers hold whatever the chip powers up with; AF and SP read FFFFh
    // on most chips, the others are left at 0 here.
    this.a = 0xff; this.f = 0xff;
    this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
    this.a2 = 0xff; this.f2 = 0xff; this.b2 = 0; this.c2 = 0; this.d2 = 0; this.e2 = 0; this.h2 = 0; this.l2 = 0;
    this.ix = 0xffff; this.iy = 0xffff;
    this.sp = 0xffff;
    this.memptr = 0;       // internal WZ register; shows only in bits 3 and 5 of BIT n,(HL)
    this.cycles = 0;       // states executed since the core was created
    this.intLine = false;  // /INT input level, driven by the machine (true = active)
    this.intVector = 0xff; // byte on the data bus during the interrupt acknowledge
    this.nmiPending = false;
    this.reset();
  }

  // /RESET clears PC, I, R, the interrupt flip-flops and the interrupt mode and ends a halt.
  // The other registers keep their contents.
  reset() {
    this.pc = 0;
    this.i = 0;
    this.r = 0;
    this.iff1 = false;
    this.iff2 = false;
    this.im = 0;
    this.eiBlock = false; // EI enables interrupts only after the following instruction
    this.halted = false;
    this.nmiPending = false;
  }

  // A falling edge on /NMI.
  nmi() {
    this.nmiPending = true;
  }

  get bc() { return (this.b << 8) | this.c; }
  set bc(v) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }
  get de() { return (this.d << 8) | this.e; }
  set de(v) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }
  get hl() { return (this.h << 8) | this.l; }
  set hl(v) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }
  get af() { return (this.a << 8) | this.f; }
  set af(v) { this.a = (v >> 8) & 0xff; this.f = v & 0xff; }

  // A plain copy of the whole state, for the debugger and saved states.
  getState() {
    const s = {};
    for (const k of Z80_STATE_KEYS) s[k] = this[k];
    return s;
  }

  setState(s) {
    for (const k of Z80_STATE_KEYS) if (s[k] !== undefined) this[k] = s[k];
  }

  // Runs one instruction (or accepts an interrupt) and returns its number of states.
  step() {
    const blocked = this.eiBlock;
    this.eiBlock = false;
    let states;
    if (this.nmiPending) {
      this.nmiPending = false;
      this.halted = false;
      this.incR();
      this.iff1 = false;
      this.push16(this.pc);
      this.pc = 0x0066;
      this.memptr = this.pc;
      states = 11;
    } else if (this.intLine && this.iff1 && !blocked) {
      this.halted = false;
      this.iff1 = false;
      this.iff2 = false;
      this.incR();
      if (this.im === 2) {
        const v = ((this.i << 8) | (this.intVector & 0xff));
        this.push16(this.pc);
        this.pc = this.read16(v);
        states = 19;
      } else if (this.im === 1) {
        this.push16(this.pc);
        this.pc = 0x0038;
        states = 13;
      } else {
        // Mode 0: the instruction comes from the data bus, two states longer than usual. Only
        // one-byte instructions are supported here (in practice RST n).
        states = this.execute(this.intVector & 0xff, 0) + 2;
      }
      this.memptr = this.pc;
    } else if (this.halted) {
      // Halt state: the CPU runs NOPs (refreshing memory) until an interrupt.
      this.incR();
      states = 4;
    } else {
      states = this.execute(this.m1(), 0);
    }
    this.cycles += states;
    return states;
  }

  incR() {
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);
  }

  // An opcode fetch (machine cycle M1), which also counts in R.
  m1() {
    this.incR();
    const v = this.bus.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  fetch8() {
    const v = this.bus.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  fetch16() {
    const lo = this.fetch8();
    return lo | (this.fetch8() << 8);
  }

  read16(addr) {
    return this.bus.read(addr) | (this.bus.read((addr + 1) & 0xffff) << 8);
  }

  write16(addr, v) {
    this.bus.write(addr, v & 0xff);
    this.bus.write((addr + 1) & 0xffff, (v >> 8) & 0xff);
  }

  push16(v) {
    this.sp = (this.sp - 1) & 0xffff;
    this.bus.write(this.sp, (v >> 8) & 0xff);
    this.sp = (this.sp - 1) & 0xffff;
    this.bus.write(this.sp, v & 0xff);
  }

  pop16() {
    const v = this.read16(this.sp);
    this.sp = (this.sp + 2) & 0xffff;
    return v;
  }

  // ---- registers; m is the index mode: 0 HL, 1 IX, 2 IY ----

  getIdx(m) {
    return m === 0 ? this.hl : m === 1 ? this.ix : this.iy;
  }

  setIdx(m, v) {
    v &= 0xffff;
    if (m === 0) this.hl = v;
    else if (m === 1) this.ix = v;
    else this.iy = v;
  }

  // Register r of an opcode (0 B, 1 C, 2 D, 3 E, 4 H, 5 L, 7 A; 6 is memory and is handled by
  // the caller). Under a DD or FD prefix H and L mean the halves of IX or IY.
  getR(r, m) {
    switch (r) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return m === 0 ? this.h : m === 1 ? this.ix >> 8 : this.iy >> 8;
      case 5: return m === 0 ? this.l : m === 1 ? this.ix & 0xff : this.iy & 0xff;
      default: return this.a;
    }
  }

  setR(r, m, v) {
    switch (r) {
      case 0: this.b = v; break;
      case 1: this.c = v; break;
      case 2: this.d = v; break;
      case 3: this.e = v; break;
      case 4:
        if (m === 0) this.h = v;
        else if (m === 1) this.ix = (this.ix & 0xff) | (v << 8);
        else this.iy = (this.iy & 0xff) | (v << 8);
        break;
      case 5:
        if (m === 0) this.l = v;
        else if (m === 1) this.ix = (this.ix & 0xff00) | v;
        else this.iy = (this.iy & 0xff00) | v;
        break;
      default: this.a = v;
    }
  }

  // Register pairs in the p field: 0 BC, 1 DE, 2 HL/IX/IY, 3 SP (or AF for PUSH and POP).
  getRP(p, m) {
    switch (p) {
      case 0: return this.bc;
      case 1: return this.de;
      case 2: return this.getIdx(m);
      default: return this.sp;
    }
  }

  setRP(p, m, v) {
    v &= 0xffff;
    switch (p) {
      case 0: this.bc = v; break;
      case 1: this.de = v; break;
      case 2: this.setIdx(m, v); break;
      default: this.sp = v;
    }
  }

  // The memory operand (HL), or (IX+d) / (IY+d) with the displacement fetched here.
  memAddr(m) {
    if (m === 0) return this.hl;
    const a = (this.getIdx(m) + sbyte(this.fetch8())) & 0xffff;
    this.memptr = a;
    return a;
  }

  // Conditions in the y field: NZ, Z, NC, C, PO, PE, P, M.
  condition(y) {
    const f = this.f;
    switch (y) {
      case 0: return (f & FZ) === 0;
      case 1: return (f & FZ) !== 0;
      case 2: return (f & FC) === 0;
      case 3: return (f & FC) !== 0;
      case 4: return (f & FP) === 0;
      case 5: return (f & FP) !== 0;
      case 6: return (f & FS) === 0;
      default: return (f & FS) !== 0;
    }
  }

  // ---- arithmetic and logic ----

  // 0 ADD, 1 ADC, 2 SUB, 3 SBC, 4 AND, 5 XOR, 6 OR, 7 CP.
  alu(op, v) {
    const a = this.a;
    let res;
    switch (op) {
      case 0: case 1:
        res = a + v + (op === 1 ? this.f & FC : 0);
        this.f = SZ[res & 0xff] | (res >> 8) | ((a ^ v ^ res) & FH) | ((~(a ^ v) & (a ^ res) & 0x80) >> 5);
        this.a = res & 0xff;
        return;
      case 2: case 3: case 7:
        res = a - v - (op === 3 ? this.f & FC : 0);
        this.f = FN | ((res >> 8) & FC) | ((a ^ v ^ res) & FH) | (((a ^ v) & (a ^ res) & 0x80) >> 5) |
          (op === 7 ? (SZ[res & 0xff] & ~FXY) | (v & FXY) : SZ[res & 0xff]);
        if (op !== 7) this.a = res & 0xff;
        return;
      case 4:
        this.a = a & v;
        this.f = SZP[this.a] | FH;
        return;
      case 5:
        this.a = a ^ v;
        this.f = SZP[this.a];
        return;
      default:
        this.a = a | v;
        this.f = SZP[this.a];
    }
  }

  inc8(v) {
    const res = (v + 1) & 0xff;
    this.f = (this.f & FC) | SZ[res] | ((res & 0x0f) === 0 ? FH : 0) | (res === 0x80 ? FP : 0);
    return res;
  }

  dec8(v) {
    const res = (v - 1) & 0xff;
    this.f = (this.f & FC) | FN | SZ[res] | ((res & 0x0f) === 0x0f ? FH : 0) | (res === 0x7f ? FP : 0);
    return res;
  }

  add16(x, v) {
    const res = x + v;
    this.memptr = (x + 1) & 0xffff;
    this.f = (this.f & (FS | FZ | FP)) | (res >> 16) | (((x ^ v ^ res) >> 8) & FH) | ((res >> 8) & FXY);
    return res & 0xffff;
  }

  adc16(v) {
    const x = this.hl;
    const res = x + v + (this.f & FC);
    this.memptr = (x + 1) & 0xffff;
    this.f = ((res >> 8) & (FS | FXY)) | ((res & 0xffff) ? 0 : FZ) | (((x ^ v ^ res) >> 8) & FH) |
      (res >> 16) | ((~(x ^ v) & (x ^ res) & 0x8000) >> 13);
    this.hl = res & 0xffff;
  }

  sbc16(v) {
    const x = this.hl;
    const res = x - v - (this.f & FC);
    this.memptr = (x + 1) & 0xffff;
    this.f = FN | ((res >> 8) & (FS | FXY)) | ((res & 0xffff) ? 0 : FZ) | (((x ^ v ^ res) >> 8) & FH) |
      ((res >> 16) & FC) | (((x ^ v) & (x ^ res) & 0x8000) >> 13);
    this.hl = res & 0xffff;
  }

  // Rotates and shifts of the CB group: 0 RLC, 1 RRC, 2 RL, 3 RR, 4 SLA, 5 SRA, 6 SLL, 7 SRL.
  rot(op, v) {
    let res, c;
    switch (op) {
      case 0: c = v >> 7; res = ((v << 1) | c) & 0xff; break;
      case 1: c = v & 1; res = (v >> 1) | (c << 7); break;
      case 2: c = v >> 7; res = ((v << 1) | (this.f & FC)) & 0xff; break;
      case 3: c = v & 1; res = (v >> 1) | ((this.f & FC) << 7); break;
      case 4: c = v >> 7; res = (v << 1) & 0xff; break;
      case 5: c = v & 1; res = (v >> 1) | (v & 0x80); break;
      case 6: c = v >> 7; res = ((v << 1) | 1) & 0xff; break; // undocumented SLL (SL1)
      default: c = v & 1; res = v >> 1;
    }
    this.f = SZP[res] | c;
    return res;
  }

  // BIT b of v; xy supplies flag bits 3 and 5 (the register itself, or the high byte of the
  // address for the memory forms).
  bit(b, v, xy) {
    const res = v & (1 << b);
    this.f = (this.f & FC) | FH | (res ? res & FS : FZ | FP) | (xy & FXY);
  }

  daa() {
    const a = this.a, f = this.f;
    let corr = 0, c = f & FC;
    if ((f & FH) || (a & 0x0f) > 9) corr = 0x06;
    if (c || a > 0x99) { corr |= 0x60; c = FC; }
    const res = (f & FN ? a - corr : a + corr) & 0xff;
    this.f = SZP[res] | ((a ^ res) & FH) | (f & FN) | c;
    this.a = res;
  }

  // ---- unprefixed opcodes, also under DD/FD (m = 1 or 2, the prefix's 4 states counted by
  // the caller) ----
  execute(op, m) {
    const y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    switch (op >> 6) {
      case 0:
        switch (z) {
          case 0:
            switch (y) {
              case 0: return 4; // NOP
              case 1: { // EX AF,AF'
                let t = this.a; this.a = this.a2; this.a2 = t;
                t = this.f; this.f = this.f2; this.f2 = t;
                return 4;
              }
              case 2: { // DJNZ e
                const e = sbyte(this.fetch8());
                this.b = (this.b - 1) & 0xff;
                if (this.b === 0) return 8;
                this.pc = (this.pc + e) & 0xffff;
                this.memptr = this.pc;
                return 13;
              }
              case 3: { // JR e
                const e = sbyte(this.fetch8());
                this.pc = (this.pc + e) & 0xffff;
                this.memptr = this.pc;
                return 12;
              }
              default: { // JR cc,e
                const e = sbyte(this.fetch8());
                if (!this.condition(y - 4)) return 7;
                this.pc = (this.pc + e) & 0xffff;
                this.memptr = this.pc;
                return 12;
              }
            }
          case 1:
            if (q === 0) { this.setRP(p, m, this.fetch16()); return 10; } // LD rp,nn
            this.setIdx(m, this.add16(this.getIdx(m), this.getRP(p, m))); // ADD HL,rp
            return 11;
          case 2:
            switch (op) {
              case 0x02: this.bus.write(this.bc, this.a); this.memptr = (this.a << 8) | ((this.c + 1) & 0xff); return 7;
              case 0x12: this.bus.write(this.de, this.a); this.memptr = (this.a << 8) | ((this.e + 1) & 0xff); return 7;
              case 0x22: { const a = this.fetch16(); this.write16(a, this.getIdx(m)); this.memptr = (a + 1) & 0xffff; return 16; }
              case 0x32: { const a = this.fetch16(); this.bus.write(a, this.a); this.memptr = (this.a << 8) | ((a + 1) & 0xff); return 13; }
              case 0x0a: this.a = this.bus.read(this.bc); this.memptr = (this.bc + 1) & 0xffff; return 7;
              case 0x1a: this.a = this.bus.read(this.de); this.memptr = (this.de + 1) & 0xffff; return 7;
              case 0x2a: { const a = this.fetch16(); this.setIdx(m, this.read16(a)); this.memptr = (a + 1) & 0xffff; return 16; }
              default: { const a = this.fetch16(); this.a = this.bus.read(a); this.memptr = (a + 1) & 0xffff; return 13; }
            }
          case 3: // INC rp / DEC rp
            this.setRP(p, m, this.getRP(p, m) + (q ? -1 : 1));
            return 6;
          case 4: case 5: // INC r / DEC r
            if (y === 6) {
              const a = this.memAddr(m);
              const v = this.bus.read(a);
              this.bus.write(a, z === 4 ? this.inc8(v) : this.dec8(v));
              return m ? 19 : 11;
            }
            this.setR(y, m, z === 4 ? this.inc8(this.getR(y, m)) : this.dec8(this.getR(y, m)));
            return 4;
          case 6: // LD r,n
            if (y === 6) {
              const a = this.memAddr(m);
              this.bus.write(a, this.fetch8());
              return m ? 15 : 10;
            }
            this.setR(y, m, this.fetch8());
            return 7;
          default: {
            const a = this.a, f = this.f;
            switch (y) {
              case 0: // RLCA
                this.a = ((a << 1) | (a >> 7)) & 0xff;
                this.f = (f & (FS | FZ | FP)) | (this.a & (FXY | FC));
                break;
              case 1: // RRCA
                this.a = ((a >> 1) | (a << 7)) & 0xff;
                this.f = (f & (FS | FZ | FP)) | (this.a & FXY) | (a & FC);
                break;
              case 2: // RLA
                this.a = ((a << 1) | (f & FC)) & 0xff;
                this.f = (f & (FS | FZ | FP)) | (this.a & FXY) | (a >> 7);
                break;
              case 3: // RRA
                this.a = (a >> 1) | ((f & FC) << 7);
                this.f = (f & (FS | FZ | FP)) | (this.a & FXY) | (a & FC);
                break;
              case 4: this.daa(); break;
              case 5: // CPL
                this.a = a ^ 0xff;
                this.f = (f & (FS | FZ | FP | FC)) | FH | FN | (this.a & FXY);
                break;
              case 6: // SCF
                this.f = (f & (FS | FZ | FP)) | FC | (a & FXY);
                break;
              default: // CCF
                this.f = (f & (FS | FZ | FP)) | ((f & FC) ? FH : FC) | (a & FXY);
            }
            return 4;
          }
        }
      case 1: // LD r,r'
        if (op === 0x76) { // HALT
          this.halted = true;
          return 4;
        }
        if (z === 6) { // LD r,(HL); under a prefix the destination is the real H or L
          const a = this.memAddr(m);
          this.setR(y, 0, this.bus.read(a));
          return m ? 15 : 7;
        }
        if (y === 6) { // LD (HL),r
          const a = this.memAddr(m);
          this.bus.write(a, this.getR(z, 0));
          return m ? 15 : 7;
        }
        this.setR(y, m, this.getR(z, m));
        return 4;
      case 2: // ALU A,r
        if (z === 6) {
          const a = this.memAddr(m);
          this.alu(y, this.bus.read(a));
          return m ? 15 : 7;
        }
        this.alu(y, this.getR(z, m));
        return 4;
      default:
        return this.executeHigh(op, m, y, z, p, q);
    }
  }

  // Opcodes C0-FF.
  executeHigh(op, m, y, z, p, q) {
    switch (z) {
      case 0: // RET cc
        if (!this.condition(y)) return 5;
        this.pc = this.pop16();
        this.memptr = this.pc;
        return 11;
      case 1:
        if (q === 0) { // POP rp
          const v = this.pop16();
          if (p === 3) this.af = v;
          else this.setRP(p, m, v);
          return 10;
        }
        switch (p) {
          case 0: this.pc = this.pop16(); this.memptr = this.pc; return 10; // RET
          case 1: { // EXX
            let t;
            t = this.b; this.b = this.b2; this.b2 = t; t = this.c; this.c = this.c2; this.c2 = t;
            t = this.d; this.d = this.d2; this.d2 = t; t = this.e; this.e = this.e2; this.e2 = t;
            t = this.h; this.h = this.h2; this.h2 = t; t = this.l; this.l = this.l2; this.l2 = t;
            return 4;
          }
          case 2: this.pc = this.getIdx(m); return 4; // JP (HL)
          default: this.sp = this.getIdx(m); return 6; // LD SP,HL
        }
      case 2: { // JP cc,nn
        const a = this.fetch16();
        this.memptr = a;
        if (this.condition(y)) this.pc = a;
        return 10;
      }
      case 3:
        switch (y) {
          case 0: this.pc = this.fetch16(); this.memptr = this.pc; return 10; // JP nn
          case 1: return this.executeCB(m); // CB prefix
          case 2: { // OUT (n),A
            const n = this.fetch8();
            this.bus.output((this.a << 8) | n, this.a);
            this.memptr = (this.a << 8) | ((n + 1) & 0xff);
            return 11;
          }
          case 3: { // IN A,(n)
            const port = (this.a << 8) | this.fetch8();
            this.a = this.bus.input(port) & 0xff;
            this.memptr = (port + 1) & 0xffff;
            return 11;
          }
          case 4: { // EX (SP),HL
            const v = this.read16(this.sp);
            this.write16(this.sp, this.getIdx(m));
            this.setIdx(m, v);
            this.memptr = v;
            return 19;
          }
          case 5: { const v = this.de; this.de = this.hl; this.hl = v; return 4; } // EX DE,HL (never IX)
          case 6: this.iff1 = false; this.iff2 = false; return 4; // DI
          default: // EI
            this.iff1 = true;
            this.iff2 = true;
            this.eiBlock = true;
            return 4;
        }
      case 4: { // CALL cc,nn
        const a = this.fetch16();
        this.memptr = a;
        if (!this.condition(y)) return 10;
        this.push16(this.pc);
        this.pc = a;
        return 17;
      }
      case 5:
        if (q === 0) { // PUSH rp
          this.push16(p === 3 ? this.af : this.getRP(p, m));
          return 11;
        }
        switch (p) {
          case 0: { // CALL nn
            const a = this.fetch16();
            this.memptr = a;
            this.push16(this.pc);
            this.pc = a;
            return 17;
          }
          case 2: return this.executeED(); // ED prefix (an earlier DD or FD has no effect)
          default: return this.executeIndexed(op);
        }
      case 6: // ALU A,n
        this.alu(y, this.fetch8());
        return 7;
      default: // RST
        this.push16(this.pc);
        this.pc = y << 3;
        this.memptr = this.pc;
        return 11;
    }
  }

  // After a DD (IX) or FD (IY) prefix. A run of prefixes counts 4 states each; the last one
  // decides. An instruction that does not use HL just runs, 4 states later.
  executeIndexed(prefix) {
    let states = 4;
    let op = this.m1();
    while (op === 0xdd || op === 0xfd) {
      prefix = op;
      states += 4;
      op = this.m1();
    }
    const m = prefix === 0xdd ? 1 : 2;
    if (op === 0xcb) return states + this.executeIndexedCB(m);
    if (op === 0xed) return states + this.executeED();
    return states + this.execute(op, m);
  }

  // CB prefix without an index.
  executeCB() {
    const op = this.m1();
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    if (z === 6) {
      const a = this.hl;
      const v = this.bus.read(a);
      if (x === 1) {
        this.bit(y, v, this.memptr >> 8);
        return 12;
      }
      this.bus.write(a, x === 0 ? this.rot(y, v) : x === 2 ? v & ~(1 << y) : v | (1 << y));
      return 15;
    }
    const v = this.getR(z, 0);
    if (x === 1) {
      this.bit(y, v, v);
      return 8;
    }
    this.setR(z, 0, x === 0 ? this.rot(y, v) : x === 2 ? v & ~(1 << y) : v | (1 << y));
    return 8;
  }

  // DD CB d op / FD CB d op: the displacement comes before the opcode, which is not an M1 cycle.
  // Apart from BIT the result is also copied into register z when z is not 6 (undocumented).
  executeIndexedCB(m) {
    const a = (this.getIdx(m) + sbyte(this.fetch8())) & 0xffff;
    const op = this.fetch8();
    this.memptr = a;
    const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
    const v = this.bus.read(a);
    if (x === 1) {
      this.bit(y, v, a >> 8);
      return 16;
    }
    const res = x === 0 ? this.rot(y, v) : x === 2 ? v & ~(1 << y) : v | (1 << y);
    this.bus.write(a, res);
    if (z !== 6) this.setR(z, 0, res);
    return 19;
  }

  // ED prefix. Undefined codes act as an 8-state NOP.
  executeED() {
    const op = this.m1();
    const y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
    if (op >= 0x40 && op < 0x80) {
      switch (z) {
        case 0: { // IN r,(C); y = 6 is the undocumented IN F,(C) (flags only)
          const v = this.bus.input(this.bc) & 0xff;
          this.memptr = (this.bc + 1) & 0xffff;
          this.f = (this.f & FC) | SZP[v];
          if (y !== 6) this.setR(y, 0, v);
          return 12;
        }
        case 1: // OUT (C),r; y = 6 is the undocumented OUT (C),0
          this.bus.output(this.bc, y === 6 ? 0 : this.getR(y, 0));
          this.memptr = (this.bc + 1) & 0xffff;
          return 12;
        case 2: // SBC HL,rp / ADC HL,rp
          if (q === 0) this.sbc16(this.getRP(p, 0));
          else this.adc16(this.getRP(p, 0));
          return 15;
        case 3: { // LD (nn),rp / LD rp,(nn)
          const a = this.fetch16();
          if (q === 0) this.write16(a, this.getRP(p, 0));
          else this.setRP(p, 0, this.read16(a));
          this.memptr = (a + 1) & 0xffff;
          return 20;
        }
        case 4: { // NEG (and its undocumented copies)
          const v = this.a;
          this.a = 0;
          this.alu(2, v);
          return 8;
        }
        case 5: // RETN / RETI (and copies): IFF1 gets IFF2 back
          this.iff1 = this.iff2;
          this.pc = this.pop16();
          this.memptr = this.pc;
          return 14;
        case 6: // IM 0 / 1 / 2 (with undocumented copies; 4E and 6E act as IM 0)
          this.im = [0, 0, 1, 2, 0, 0, 1, 2][y];
          return 8;
        default:
          switch (y) {
            case 0: this.i = this.a; return 9; // LD I,A
            case 1: this.r = this.a; return 9; // LD R,A
            case 2: // LD A,I
              this.a = this.i;
              this.f = (this.f & FC) | SZ[this.a] | (this.iff2 ? FP : 0);
              return 9;
            case 3: // LD A,R
              this.a = this.r;
              this.f = (this.f & FC) | SZ[this.a] | (this.iff2 ? FP : 0);
              return 9;
            case 4: { // RRD
              const a = this.hl, v = this.bus.read(a);
              this.bus.write(a, ((this.a << 4) | (v >> 4)) & 0xff);
              this.a = (this.a & 0xf0) | (v & 0x0f);
              this.f = (this.f & FC) | SZP[this.a];
              this.memptr = (a + 1) & 0xffff;
              return 18;
            }
            case 5: { // RLD
              const a = this.hl, v = this.bus.read(a);
              this.bus.write(a, ((v << 4) | (this.a & 0x0f)) & 0xff);
              this.a = (this.a & 0xf0) | (v >> 4);
              this.f = (this.f & FC) | SZP[this.a];
              this.memptr = (a + 1) & 0xffff;
              return 18;
            }
            default: return 8; // ED 77, ED 7F: NOP
          }
      }
    }
    if (op >= 0xa0 && op <= 0xbb && z <= 3 && y >= 4) return this.block(y, z);
    return 8;
  }

  // Block instructions: y 4 = ...I, 5 = ...D, 6 = ...IR, 7 = ...DR; z 0 LD, 1 CP, 2 IN, 3 OUT.
  block(y, z) {
    const dec = y & 1, repeat = y >= 6, step = dec ? -1 : 1;
    switch (z) {
      case 0: { // LDI LDD LDIR LDDR
        const v = this.bus.read(this.hl);
        this.bus.write(this.de, v);
        this.hl = (this.hl + step) & 0xffff;
        this.de = (this.de + step) & 0xffff;
        this.bc = (this.bc - 1) & 0xffff;
        const n = (v + this.a) & 0xff;
        this.f = (this.f & (FS | FZ | FC)) | (this.bc ? FP : 0) | (n & FX) | ((n << 4) & FY);
        if (repeat && this.bc !== 0) {
          this.pc = (this.pc - 2) & 0xffff;
          this.memptr = (this.pc + 1) & 0xffff;
          return 21;
        }
        return 16;
      }
      case 1: { // CPI CPD CPIR CPDR
        const v = this.bus.read(this.hl);
        const res = (this.a - v) & 0xff;
        const h = (this.a ^ v ^ res) & FH;
        const n = (res - (h ? 1 : 0)) & 0xff;
        this.hl = (this.hl + step) & 0xffff;
        this.bc = (this.bc - 1) & 0xffff;
        this.memptr = (this.memptr + step) & 0xffff;
        this.f = (this.f & FC) | FN | (SZ[res] & ~FXY) | h | (this.bc ? FP : 0) | (n & FX) | ((n << 4) & FY);
        if (repeat && this.bc !== 0 && res !== 0) {
          this.pc = (this.pc - 2) & 0xffff;
          this.memptr = (this.pc + 1) & 0xffff;
          return 21;
        }
        return 16;
      }
      case 2: { // INI IND INIR INDR
        const v = this.bus.input(this.bc) & 0xff;
        this.memptr = (this.bc + step) & 0xffff;
        this.bus.write(this.hl, v);
        this.hl = (this.hl + step) & 0xffff;
        this.b = (this.b - 1) & 0xff;
        this.blockIOFlags(v, v + ((this.c + step) & 0xff));
        if (repeat && this.b !== 0) {
          this.pc = (this.pc - 2) & 0xffff;
          return 21;
        }
        return 16;
      }
      default: { // OUTI OUTD OTIR OTDR
        const v = this.bus.read(this.hl);
        this.b = (this.b - 1) & 0xff;
        this.memptr = (this.bc + step) & 0xffff;
        this.bus.output(this.bc, v);
        this.hl = (this.hl + step) & 0xffff;
        this.blockIOFlags(v, v + this.l);
        if (repeat && this.b !== 0) {
          this.pc = (this.pc - 2) & 0xffff;
          return 21;
        }
        return 16;
      }
    }
  }

  // Flags after INI/IND/OUTI/OUTD (Young, section 4.3): S, Z, Y, X from B; N from bit 7 of the
  // byte; H and C from the carry of k; P/V is the parity of (k & 7) ^ B.
  blockIOFlags(v, k) {
    this.f = SZ[this.b] | ((v >> 6) & FN) | (k > 0xff ? FH | FC : 0) | (SZP[(k & 7) ^ this.b] & FP);
  }
}

const Z80_STATE_KEYS = Object.freeze([
  'a', 'f', 'b', 'c', 'd', 'e', 'h', 'l', 'a2', 'f2', 'b2', 'c2', 'd2', 'e2', 'h2', 'l2',
  'ix', 'iy', 'sp', 'pc', 'i', 'r', 'iff1', 'iff2', 'im', 'eiBlock', 'halted', 'memptr', 'cycles',
]);
