// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// 8080 mnemonics in Intel syntax, for the opcode table and the disassembler. Operands are
// written as templates: "nn" is a byte, "nnnn" a 16-bit address or value.

const REG = ['B', 'C', 'D', 'E', 'H', 'L', 'M', 'A'];
const PAIR = ['B', 'D', 'H', 'SP'];
const PAIR_PSW = ['B', 'D', 'H', 'PSW'];
const COND = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ALU = ['ADD', 'ADC', 'SUB', 'SBB', 'ANA', 'XRA', 'ORA', 'CMP'];
const ALU_IMM = ['ADI', 'ACI', 'SUI', 'SBI', 'ANI', 'XRI', 'ORI', 'CPI'];

// Returns { text, length, undocumented } for one opcode.
function describe(op) {
  const r = (op >> 3) & 7, s = op & 7, p = (op >> 4) & 3;
  if (op === 0x76) return ['HLT', 1];
  if (op >= 0x40 && op < 0x80) return [`MOV ${REG[r]},${REG[s]}`, 1];
  if (op >= 0x80 && op < 0xc0) return [`${ALU[r]} ${REG[s]}`, 1];
  if (op < 0x40) {
    switch (s) {
      case 0: return op === 0 ? ['NOP', 1] : ['NOP', 1, true];
      case 1: return (op & 8) ? [`DAD ${PAIR[p]}`, 1] : [`LXI ${PAIR[p]},nnnn`, 3];
      case 2: return [
        ['STAX B', 1], ['LDAX B', 1], ['STAX D', 1], ['LDAX D', 1],
        ['SHLD nnnn', 3], ['LHLD nnnn', 3], ['STA nnnn', 3], ['LDA nnnn', 3],
      ][r];
      case 3: return [`${(op & 8) ? 'DCX' : 'INX'} ${PAIR[p]}`, 1];
      case 4: return [`INR ${REG[r]}`, 1];
      case 5: return [`DCR ${REG[r]}`, 1];
      case 6: return [`MVI ${REG[r]},nn`, 2];
      default: return [['RLC', 'RRC', 'RAL', 'RAR', 'DAA', 'CMA', 'STC', 'CMC'][r], 1];
    }
  }
  switch (s) {
    case 0: return [`R${COND[r]}`, 1];
    case 1:
      if (op === 0xc9) return ['RET', 1];
      if (op === 0xd9) return ['RET', 1, true];
      if (op === 0xe9) return ['PCHL', 1];
      if (op === 0xf9) return ['SPHL', 1];
      return [`POP ${PAIR_PSW[p]}`, 1];
    case 2: return [`J${COND[r]} nnnn`, 3];
    case 3: return [
      ['JMP nnnn', 3], ['JMP nnnn', 3, true], ['OUT nn', 2], ['IN nn', 2],
      ['XTHL', 1], ['XCHG', 1], ['DI', 1], ['EI', 1],
    ][r];
    case 4: return [`C${COND[r]} nnnn`, 3];
    case 5:
      if (op === 0xcd) return ['CALL nnnn', 3];
      if (op & 8) return ['CALL nnnn', 3, true];
      return [`PUSH ${PAIR_PSW[p]}`, 1];
    case 6: return [`${ALU_IMM[r]} nn`, 2];
    default: return [`RST ${r}`, 1];
  }
}

// States per opcode from the Intel manual's summary (98-153B, page 5-19); "5/11" means
// condition false / condition true. Undocumented copies take the states of their originals.
// tests/i8080.test.mjs checks the core against its own copy of the manual's table and
// tests/asm8080.test.mjs checks this table against the core.
const STATES = `
 4 10 7 5 5 5 7 4 4 10 7 5 5 5 7 4  4 10 7 5 5 5 7 4 4 10 7 5 5 5 7 4
 4 10 16 5 5 5 7 4 4 10 16 5 5 5 7 4  4 10 13 5 10 10 10 4 4 10 13 5 5 5 7 4
 5 5 5 5 5 5 7 5 5 5 5 5 5 5 7 5  5 5 5 5 5 5 7 5 5 5 5 5 5 5 7 5
 5 5 5 5 5 5 7 5 5 5 5 5 5 5 7 5  7 7 7 7 7 7 7 7 5 5 5 5 5 5 7 5
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4  4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4  4 4 4 4 4 4 7 4 4 4 4 4 4 4 7 4
 5/11 10 10 10 11/17 11 7 11 5/11 10 10 10 11/17 17 7 11  5/11 10 10 10 11/17 11 7 11 5/11 10 10 10 11/17 17 7 11
 5/11 10 10 18 11/17 11 7 11 5/11 5 10 4 11/17 17 7 11  5/11 10 10 4 11/17 11 7 11 5/11 5 10 4 11/17 17 7 11
`.trim().split(/\s+/);

export const I8080_OPCODES = Object.freeze(Array.from({ length: 256 }, (_, op) => {
  const [text, length, undocumented = false] = describe(op);
  return Object.freeze({ op, text, length, undocumented, states: STATES[op] });
}));

const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');

// Disassembles the instruction at addr; read(a) returns the byte at address a.
export function disassemble(read, addr) {
  const info = I8080_OPCODES[read(addr & 0xffff)];
  const bytes = [];
  for (let i = 0; i < info.length; i++) bytes.push(read((addr + i) & 0xffff));
  let text = info.text;
  if (info.length === 2) text = text.replace('nn', hex(bytes[1], 2) + 'h');
  if (info.length === 3) text = text.replace('nnnn', hex(bytes[1] | (bytes[2] << 8), 4) + 'h');
  return { addr: addr & 0xffff, bytes, text, length: info.length, undocumented: info.undocumented };
}
