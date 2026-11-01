// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Intel 8080A CPU core. The PMI-80 uses the TESLA MHB8080A, a clone of the 8080A.
//
// Reference: Intel 8080 Microcomputer Systems User's Manual, 98-153B, September 1975,
// chapter 4 (instruction set) and "Summary of Processor Instructions" on page 5-19, which gives
// the number of states (clock periods) of every instruction. The core is instruction-level:
// step() runs one whole instruction and returns its states; it does not model the individual
// machine cycles inside an instruction.
//
// The bus is an object supplied by the machine:
//   read(addr) -> byte, write(addr, byte), input(port) -> byte, output(port, byte).
// During step() the `cycles` counter still holds the time at the start of the instruction.

// PARITY[v] is 1 when v has an even number of set bits (the 8080 P flag).
const PARITY = new Uint8Array(256);
for (let v = 0; v < 256; v++) {
  let bits = 0;
  for (let b = v; b; b >>= 1) bits += b & 1;
  PARITY[v] = (bits & 1) ? 0 : 1;
}

// Bits of the flag byte as pushed by PUSH PSW: S Z 0 AC 0 P 1 CY.
export const I8080_FLAGS = Object.freeze({ CY: 0x01, P: 0x04, AC: 0x10, Z: 0x40, S: 0x80 });

// Register numbers used in opcodes (DDD/SSS fields); 6 is the memory byte at HL.
export const I8080_REG_NAMES = Object.freeze(['B', 'C', 'D', 'E', 'H', 'L', 'M', 'A']);

export class I8080 {
  constructor(bus) {
    this.bus = bus;
    this.a = 0; this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
    this.sp = 0;
    this.fS = false; this.fZ = false; this.fAC = false; this.fP = false; this.fCY = false;
    this.cycles = 0;       // states executed since the core was created
    this.intLine = false;  // INT input level, driven by the machine
    this.intVector = 0xff; // instruction the hardware supplies during INTA (0xFF = RST 7)
    this.reset();
  }

  // RESET clears the program counter and the interrupt enable flip-flop and ends a halt.
  // The other registers keep their contents (the manual leaves them undefined).
  reset() {
    this.pc = 0;
    this.inte = false;
    this.intBlock = false; // EI enables interrupts only after the following instruction
    this.halted = false;
  }

  get f() {
    return (this.fS ? 0x80 : 0) | (this.fZ ? 0x40 : 0) | (this.fAC ? 0x10 : 0) |
      (this.fP ? 0x04 : 0) | 0x02 | (this.fCY ? 0x01 : 0);
  }

  set f(v) {
    this.fS = (v & 0x80) !== 0; this.fZ = (v & 0x40) !== 0; this.fAC = (v & 0x10) !== 0;
    this.fP = (v & 0x04) !== 0; this.fCY = (v & 0x01) !== 0;
  }

  get bc() { return (this.b << 8) | this.c; }
  set bc(v) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }
  get de() { return (this.d << 8) | this.e; }
  set de(v) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }
  get hl() { return (this.h << 8) | this.l; }
  set hl(v) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }

  // A plain copy of the whole state, for the debugger and saved states.
  getState() {
    return {
      a: this.a, f: this.f, b: this.b, c: this.c, d: this.d, e: this.e, h: this.h, l: this.l,
      sp: this.sp, pc: this.pc, inte: this.inte, intBlock: this.intBlock,
      halted: this.halted, cycles: this.cycles,
    };
  }

  setState(s) {
    this.a = s.a & 0xff; this.f = s.f;
    this.b = s.b & 0xff; this.c = s.c & 0xff; this.d = s.d & 0xff; this.e = s.e & 0xff;
    this.h = s.h & 0xff; this.l = s.l & 0xff;
    this.sp = s.sp & 0xffff; this.pc = s.pc & 0xffff;
    this.inte = !!s.inte; this.intBlock = !!s.intBlock; this.halted = !!s.halted;
    if (s.cycles !== undefined) this.cycles = s.cycles;
  }

  // Runs one instruction (or acknowledges an interrupt) and returns its number of states.
  step() {
    const blocked = this.intBlock;
    this.intBlock = false;
    let states;
    if (this.intLine && this.inte && !blocked) {
      // INTA: the instruction comes from the data bus, the PC is not incremented. Only
      // one-byte instructions are supported here (in practice RST n).
      this.inte = false;
      this.halted = false;
      states = this.execute(this.intVector & 0xff);
    } else if (this.halted) {
      // Halt state: no instruction runs; time passes in steps of 4 states.
      states = 4;
    } else {
      states = this.execute(this.fetch8());
    }
    this.cycles += states;
    return states;
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

  getReg(r) {
    switch (r) {
      case 0: return this.b;
      case 1: return this.c;
      case 2: return this.d;
      case 3: return this.e;
      case 4: return this.h;
      case 5: return this.l;
      case 6: return this.bus.read(this.hl);
      default: return this.a;
    }
  }

  setReg(r, v) {
    switch (r) {
      case 0: this.b = v; break;
      case 1: this.c = v; break;
      case 2: this.d = v; break;
      case 3: this.e = v; break;
      case 4: this.h = v; break;
      case 5: this.l = v; break;
      case 6: this.bus.write(this.hl, v); break;
      default: this.a = v;
    }
  }

  // Register pairs in the RP field: 0 BC, 1 DE, 2 HL, 3 SP.
  getPair(p) {
    switch (p) {
      case 0: return this.bc;
      case 1: return this.de;
      case 2: return this.hl;
      default: return this.sp;
    }
  }

  setPair(p, v) {
    v &= 0xffff;
    switch (p) {
      case 0: this.bc = v; break;
      case 1: this.de = v; break;
      case 2: this.hl = v; break;
      default: this.sp = v;
    }
  }

  // Conditions in the CCC field: NZ, Z, NC, C, PO, PE, P, M.
  condition(ccc) {
    switch (ccc) {
      case 0: return !this.fZ;
      case 1: return this.fZ;
      case 2: return !this.fCY;
      case 3: return this.fCY;
      case 4: return !this.fP;
      case 5: return this.fP;
      case 6: return !this.fS;
      default: return this.fS;
    }
  }

  setSZP(v) {
    this.fS = (v & 0x80) !== 0;
    this.fZ = v === 0;
    this.fP = PARITY[v] === 1;
  }

  // Arithmetic and logic group: 0 ADD, 1 ADC, 2 SUB, 3 SBB, 4 ANA, 5 XRA, 6 ORA, 7 CMP.
  alu(op, v) {
    const a = this.a;
    let res;
    switch (op) {
      case 0: case 1:
        res = a + v + (op === 1 && this.fCY ? 1 : 0);
        this.fAC = ((a ^ v ^ res) & 0x10) !== 0;
        this.fCY = res > 0xff;
        this.a = res & 0xff;
        break;
      case 2: case 3: case 7:
        // The 8080 subtracts by adding the complement: AC is the carry out of bit 3 of
        // A + ~v + (1 - borrow), and CY is the borrow.
        res = a - v - (op === 3 && this.fCY ? 1 : 0);
        this.fAC = (~(a ^ v ^ res) & 0x10) !== 0;
        this.fCY = res < 0;
        res &= 0xff;
        if (op !== 7) this.a = res;
        this.setSZP(res);
        return;
      case 4:
        // 8080A: AND sets AC to the OR of bit 3 of both operands.
        this.fAC = ((a | v) & 0x08) !== 0;
        this.fCY = false;
        this.a = a & v;
        break;
      case 5:
        this.fAC = false; this.fCY = false;
        this.a = a ^ v;
        break;
      default:
        this.fAC = false; this.fCY = false;
        this.a = a | v;
    }
    this.setSZP(this.a);
  }

  inr(v) {
    const res = (v + 1) & 0xff;
    this.fAC = (res & 0x0f) === 0;
    this.setSZP(res);
    return res;
  }

  dcr(v) {
    const res = (v - 1) & 0xff;
    this.fAC = (res & 0x0f) !== 0x0f;
    this.setSZP(res);
    return res;
  }

  daa() {
    const a = this.a;
    let corr = 0;
    let cy = this.fCY;
    if (this.fAC || (a & 0x0f) > 9) corr |= 0x06;
    if (cy || (a >> 4) > 9 || ((a >> 4) >= 9 && (a & 0x0f) > 9)) {
      corr |= 0x60;
      cy = true;
    }
    const res = a + corr;
    this.fAC = ((a ^ corr ^ res) & 0x10) !== 0;
    this.fCY = cy;
    this.a = res & 0xff;
    this.setSZP(this.a);
  }

  // Executes one opcode and returns its states (manual page 5-19; for conditional calls and
  // returns the larger number applies when the condition is true).
  execute(op) {
    if (op >= 0x40 && op < 0x80) {
      if (op === 0x76) { // HLT
        this.halted = true;
        return 7;
      }
      const dst = (op >> 3) & 7, src = op & 7;
      this.setReg(dst, this.getReg(src));
      return dst === 6 || src === 6 ? 7 : 5;
    }
    if (op >= 0x80 && op < 0xc0) {
      this.alu((op >> 3) & 7, this.getReg(op & 7));
      return (op & 7) === 6 ? 7 : 4;
    }
    if (op < 0x40) return this.executeLow(op);
    return this.executeHigh(op);
  }

  // Opcodes 00-3F.
  executeLow(op) {
    const r = (op >> 3) & 7, p = (op >> 4) & 3;
    switch (op & 7) {
      case 0: // NOP; 08 10 18 20 28 30 38 are undocumented copies of NOP
        return 4;
      case 1:
        if (op & 8) { // DAD rp
          const res = this.hl + this.getPair(p);
          this.fCY = res > 0xffff;
          this.hl = res & 0xffff;
          return 10;
        }
        this.setPair(p, this.fetch16()); // LXI rp
        return 10;
      case 2:
        switch (op) {
          case 0x02: this.bus.write(this.bc, this.a); return 7;  // STAX B
          case 0x12: this.bus.write(this.de, this.a); return 7;  // STAX D
          case 0x22: this.write16(this.fetch16(), this.hl); return 16; // SHLD
          case 0x32: this.bus.write(this.fetch16(), this.a); return 13; // STA
          case 0x0a: this.a = this.bus.read(this.bc); return 7;  // LDAX B
          case 0x1a: this.a = this.bus.read(this.de); return 7;  // LDAX D
          case 0x2a: this.hl = this.read16(this.fetch16()); return 16; // LHLD
          default: this.a = this.bus.read(this.fetch16()); return 13;  // LDA
        }
      case 3: // INX rp / DCX rp
        this.setPair(p, this.getPair(p) + ((op & 8) ? -1 : 1));
        return 5;
      case 4: // INR r
        this.setReg(r, this.inr(this.getReg(r)));
        return r === 6 ? 10 : 5;
      case 5: // DCR r
        this.setReg(r, this.dcr(this.getReg(r)));
        return r === 6 ? 10 : 5;
      case 6: // MVI r
        this.setReg(r, this.fetch8());
        return r === 6 ? 10 : 7;
      default: {
        const a = this.a;
        switch (op) {
          case 0x07: // RLC
            this.fCY = (a & 0x80) !== 0;
            this.a = ((a << 1) | (a >> 7)) & 0xff;
            break;
          case 0x0f: // RRC
            this.fCY = (a & 1) !== 0;
            this.a = ((a >> 1) | (a << 7)) & 0xff;
            break;
          case 0x17: // RAL
            this.a = ((a << 1) | (this.fCY ? 1 : 0)) & 0xff;
            this.fCY = (a & 0x80) !== 0;
            break;
          case 0x1f: // RAR
            this.a = (a >> 1) | (this.fCY ? 0x80 : 0);
            this.fCY = (a & 1) !== 0;
            break;
          case 0x27: this.daa(); break;
          case 0x2f: this.a = a ^ 0xff; break; // CMA
          case 0x37: this.fCY = true; break;     // STC
          default: this.fCY = !this.fCY;         // CMC
        }
        return 4;
      }
    }
  }

  // Opcodes C0-FF.
  executeHigh(op) {
    const ccc = (op >> 3) & 7, p = (op >> 4) & 3;
    switch (op & 7) {
      case 0: // Rcc
        if (!this.condition(ccc)) return 5;
        this.pc = this.pop16();
        return 11;
      case 1:
        switch (op) {
          case 0xc9: case 0xd9: // RET; D9 is an undocumented copy
            this.pc = this.pop16();
            return 10;
          case 0xe9: this.pc = this.hl; return 5; // PCHL
          case 0xf9: this.sp = this.hl; return 5; // SPHL
          default: { // POP rp, where 3 is PSW
            const v = this.pop16();
            if (p === 3) {
              this.f = v & 0xff;
              this.a = v >> 8;
            } else {
              this.setPair(p, v);
            }
            return 10;
          }
        }
      case 2: { // Jcc
        const addr = this.fetch16();
        if (this.condition(ccc)) this.pc = addr;
        return 10;
      }
      case 3:
        switch (op) {
          case 0xc3: case 0xcb: // JMP; CB is an undocumented copy
            this.pc = this.fetch16();
            return 10;
          case 0xd3: this.bus.output(this.fetch8(), this.a); return 10; // OUT
          case 0xdb: this.a = this.bus.input(this.fetch8()) & 0xff; return 10; // IN
          case 0xe3: { // XTHL
            const v = this.read16(this.sp);
            this.write16(this.sp, this.hl);
            this.hl = v;
            return 18;
          }
          case 0xeb: { // XCHG
            const v = this.de;
            this.de = this.hl;
            this.hl = v;
            return 4;
          }
          case 0xf3: this.inte = false; return 4; // DI
          default: // EI
            this.inte = true;
            this.intBlock = true;
            return 4;
        }
      case 4: { // Ccc
        const addr = this.fetch16();
        if (!this.condition(ccc)) return 11;
        this.push16(this.pc);
        this.pc = addr;
        return 17;
      }
      case 5:
        if (op & 8) { // CALL; DD ED FD are undocumented copies
          const addr = this.fetch16();
          this.push16(this.pc);
          this.pc = addr;
          return 17;
        }
        this.push16(p === 3 ? (this.a << 8) | this.f : this.getPair(p)); // PUSH rp / PSW
        return 11;
      case 6: // ADI ACI SUI SBI ANI XRI ORI CPI
        this.alu(ccc, this.fetch8());
        return 7;
      default: // RST n
        this.push16(this.pc);
        this.pc = ccc << 3;
        return 11;
    }
  }
}
