// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Z80 mnemonics in Zilog syntax, for the opcode table and the disassembler. Operands are
// written as templates: {n} is a byte, {nn} a 16-bit address or value, {d} the signed
// displacement of (IX+d) / (IY+d) and {e} the target of a relative jump. States are given as in
// the Zilog manual; "7/12" means condition false / condition true (for the repeating block
// instructions: last pass / one more pass).

const ZR = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const ZRP = ['BC', 'DE', 'HL', 'SP'];
const ZRP2 = ['BC', 'DE', 'HL', 'AF'];
const ZCC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ZALU = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
const ZROT = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
const ZIDX = ['HL', 'IX', 'IY'];

// One unprefixed opcode, or one under DD (m = 1) or FD (m = 2). Returns
// [text, length, states, undocumented, usesIndex].
function zMain(op, m) {
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
  const hl = ZIDX[m];
  const mem = m ? `(${hl}+{d})` : '(HL)';
  // register names; under a prefix H and L are the halves of the index register
  const r8 = i => (i === 6 ? mem : m && (i === 4 || i === 5) ? hl + (i === 4 ? 'H' : 'L') : ZR[i]);
  const xt = m ? 4 : 0; // the prefix's states
  const memX = m ? 8 : 0; // (IX+d) instead of (HL): displacement and address addition
  const dl = m ? 1 : 0;   // displacement byte
  switch (x) {
    case 0:
      switch (z) {
        case 0: return [['NOP', 1, '4'], ['EX AF,AF\'', 1, '4'], ['DJNZ {e}', 2, '8/13'], ['JR {e}', 2, '12'],
          [`JR ${ZCC[y - 4]},{e}`, 2, '7/12']][Math.min(y, 4)].concat([false, false]);
        case 1: return q === 0
          ? [`LD ${p === 2 ? hl : ZRP[p]},{nn}`, 3, String(10 + xt), false, p === 2]
          : [`ADD ${hl},${p === 2 ? hl : ZRP[p]}`, 1, String(11 + xt), false, true];
        case 2: {
          const [text, length, states] = [
            ['LD (BC),A', 1, 7], ['LD A,(BC)', 1, 7], ['LD (DE),A', 1, 7], ['LD A,(DE)', 1, 7],
            [`LD ({nn}),${hl}`, 3, 16 + xt], [`LD ${hl},({nn})`, 3, 16 + xt], ['LD ({nn}),A', 3, 13], ['LD A,({nn})', 3, 13],
          ][y];
          return [text, length, String(states), false, y === 4 || y === 5];
        }
        case 3: return [`${q ? 'DEC' : 'INC'} ${p === 2 ? hl : ZRP[p]}`, 1, String(6 + xt), false, p === 2];
        case 4: case 5: {
          const name = z === 4 ? 'INC' : 'DEC';
          if (y === 6) return [`${name} ${mem}`, 1 + dl, String(11 + xt + memX), false, true];
          return [`${name} ${r8(y)}`, 1, String(4 + xt), m !== 0 && (y === 4 || y === 5), y === 4 || y === 5];
        }
        case 6:
          if (y === 6) return [`LD ${mem},{n}`, 2 + dl, String(10 + xt + (m ? 5 : 0)), false, true];
          return [`LD ${r8(y)},{n}`, 2, String(7 + xt), m !== 0 && (y === 4 || y === 5), y === 4 || y === 5];
        default: return [['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y], 1, '4', false, false];
      }
    case 1:
      if (op === 0x76) return ['HALT', 1, '4', false, false];
      if (z === 6) return [`LD ${ZR[y]},${mem}`, 1 + dl, String(7 + xt + memX), false, true];
      if (y === 6) return [`LD ${mem},${ZR[z]}`, 1 + dl, String(7 + xt + memX), false, true];
      return [`LD ${r8(y)},${r8(z)}`, 1, String(4 + xt), m !== 0 && (y === 4 || y === 5 || z === 4 || z === 5),
        y === 4 || y === 5 || z === 4 || z === 5];
    case 2:
      if (z === 6) return [`${ZALU[y]}${mem}`, 1 + dl, String(7 + xt + memX), false, true];
      return [`${ZALU[y]}${r8(z)}`, 1, String(4 + xt), m !== 0 && (z === 4 || z === 5), z === 4 || z === 5];
    default:
      switch (z) {
        case 0: return [`RET ${ZCC[y]}`, 1, '5/11', false, false];
        case 1:
          if (q === 0) return [`POP ${p === 2 ? hl : ZRP2[p]}`, 1, String(10 + xt), false, p === 2];
          return [['RET', 1, '10', false, false], ['EXX', 1, '4', false, false],
            [`JP (${hl})`, 1, String(4 + xt), false, true], [`LD SP,${hl}`, 1, String(6 + xt), false, true]][p];
        case 2: return [`JP ${ZCC[y]},{nn}`, 3, '10', false, false];
        case 3: return [['JP {nn}', 3, '10', false, false], ['(CB)', 1, '', false, false],
          ['OUT ({n}),A', 2, '11', false, false], ['IN A,({n})', 2, '11', false, false],
          [`EX (SP),${hl}`, 1, String(19 + xt), false, true], ['EX DE,HL', 1, '4', false, false],
          ['DI', 1, '4', false, false], ['EI', 1, '4', false, false]][y];
        case 4: return [`CALL ${ZCC[y]},{nn}`, 3, '10/17', false, false];
        case 5:
          if (q === 0) return [`PUSH ${p === 2 ? hl : ZRP2[p]}`, 1, String(11 + xt), false, p === 2];
          return [['CALL {nn}', 3, '17', false, false], ['(DD)', 1, '', false, false],
            ['(ED)', 1, '', false, false], ['(FD)', 1, '', false, false]][p];
        case 6: return [`${ZALU[y]}{n}`, 2, '7', false, false];
        default: return [`RST ${(y << 3).toString(16).toUpperCase().padStart(2, '0')}h`, 1, '11', false, false];
      }
  }
}

// CB op, or DD CB d op / FD CB d op (m = 1 or 2). Returns [text, states, undocumented].
function zCB(op, m) {
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
  if (m === 0) {
    const r = ZR[z];
    if (x === 0) return [`${ZROT[y]} ${r}`, z === 6 ? '15' : '8', y === 6];
    if (x === 1) return [`BIT ${y},${r}`, z === 6 ? '12' : '8', false];
    return [`${x === 2 ? 'RES' : 'SET'} ${y},${r}`, z === 6 ? '15' : '8', false];
  }
  const mem = `(${ZIDX[m]}+{d})`;
  // with z other than 6 the result is also copied into a register (undocumented)
  const copy = z === 6 ? '' : `,${ZR[z]}`;
  if (x === 0) return [`${ZROT[y]} ${mem}${copy}`, '23', y === 6 || z !== 6];
  if (x === 1) return [`BIT ${y},${mem}`, '20', z !== 6];
  return [`${x === 2 ? 'RES' : 'SET'} ${y},${mem}${copy}`, '23', z !== 6];
}

// ED op. Returns [text, length, states, undocumented] or null for a code that acts as a NOP.
function zED(op) {
  const y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;
  if (op >= 0x40 && op < 0x80) {
    switch (z) {
      case 0: return y === 6 ? ['IN F,(C)', 2, '12', true] : [`IN ${ZR[y]},(C)`, 2, '12', false];
      case 1: return y === 6 ? ['OUT (C),0', 2, '12', true] : [`OUT (C),${ZR[y]}`, 2, '12', false];
      case 2: return [`${q ? 'ADC' : 'SBC'} HL,${ZRP[p]}`, 2, '15', false];
      case 3: return q === 0
        ? [`LD ({nn}),${ZRP[p]}`, 4, '20', p === 2]
        : [`LD ${ZRP[p]},({nn})`, 4, '20', p === 2];
      case 4: return ['NEG', 2, '8', op !== 0x44];
      case 5: return [op === 0x4d ? 'RETI' : 'RETN', 2, '14', op !== 0x45 && op !== 0x4d];
      case 6: return [`IM ${[0, 0, 1, 2, 0, 0, 1, 2][y]}`, 2, '8', y === 1 || y >= 4];
      default:
        if (y >= 6) return ['NOP', 2, '8', true];
        return [['LD I,A', 2, '9'], ['LD R,A', 2, '9'], ['LD A,I', 2, '9'], ['LD A,R', 2, '9'],
          ['RRD', 2, '18'], ['RLD', 2, '18']][y].concat([false]);
    }
  }
  if (op >= 0xa0 && op <= 0xbb && z <= 3 && y >= 4) {
    const name = [['LDI', 'CPI', 'INI', 'OUTI'], ['LDD', 'CPD', 'IND', 'OUTD'], ['LDIR', 'CPIR', 'INIR', 'OTIR'],
      ['LDDR', 'CPDR', 'INDR', 'OTDR']][y - 4][z];
    return [name, 2, y >= 6 ? '16/21' : '16', false];
  }
  return null;
}

const zhex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
// Template operands as the opcode table shows them.
const zPlain = text => text.replace('{nn}', 'nn').replace('{n}', 'n').replace('+{d}', '+d').replace('{e}', 'e');

// Every opcode for the reference table: { code, text, length, states, undocumented }, where code
// is the opcode bytes as text ("DD 21", "DD CB d 06"). Under DD and FD only the instructions
// that use IX or IY are listed (the others just run 4 states later); of DD CB and FD CB only the
// forms without the undocumented register copy.
export const Z80_OPCODES = Object.freeze((() => {
  const list = [];
  const add = (code, text, length, states, undocumented) =>
    list.push(Object.freeze({ code, text: zPlain(text), length, states, undocumented }));
  for (let op = 0; op < 256; op++) {
    if (op === 0xcb || op === 0xdd || op === 0xed || op === 0xfd) continue;
    const [text, length, states, undoc] = zMain(op, 0);
    add(zhex(op, 2), text, length, states, undoc);
  }
  for (let op = 0; op < 256; op++) {
    const [text, states, undoc] = zCB(op, 0);
    add(`CB ${zhex(op, 2)}`, text, 2, states, undoc);
  }
  for (let op = 0; op < 256; op++) {
    const e = zED(op);
    if (e) add(`ED ${zhex(op, 2)}`, e[0], e[1], e[2], e[3]);
  }
  for (const [m, pre] of [[1, 'DD'], [2, 'FD']]) {
    for (let op = 0; op < 256; op++) {
      if (op === 0xcb || op === 0xdd || op === 0xed || op === 0xfd) continue;
      const [text, length, states, undoc, uses] = zMain(op, m);
      if (uses) add(`${pre} ${zhex(op, 2)}`, text, length + 1, states, undoc);
    }
    for (let op = 0; op < 256; op++) {
      const [text, states, undoc] = zCB(op, m);
      if ((op & 7) === 6) add(`${pre} CB d ${zhex(op, 2)}`, text, 4, states, undoc);
    }
  }
  return list;
})());

// The 256 unprefixed opcodes, for the 16 x 16 grid (CB, DD, ED and FD show as prefixes).
export const Z80_MAIN_OPCODES = Object.freeze(Array.from({ length: 256 }, (_, op) => {
  const [text, length, states, undocumented] = zMain(op, 0);
  return Object.freeze({ op, text: zPlain(text), length, states, undocumented });
}));

// Disassembles the instruction at addr; read(a) returns the byte at address a. Returns
// { addr, bytes, text, length, undocumented }.
export function disassembleZ80(read, addr) {
  addr &= 0xffff;
  const at = i => read((addr + i) & 0xffff);
  let op = at(0);
  let text, length, undocumented = false, pos = 1, m = 0;
  if (op === 0xdd || op === 0xfd) {
    const next = at(1);
    m = op === 0xdd ? 1 : 2;
    if (next === 0xcb) {
      const d = at(2), cb = at(3);
      const [t, , u] = zCB(cb, m);
      return zFinish(at, addr, 4, t, u, { d });
    }
    const info = next === 0xdd || next === 0xfd || next === 0xed ? null : zMain(next, m);
    if (!info || !info[4]) { // the prefix alone, then the next instruction
      return { addr, bytes: [op], text: `NOP (${zhex(op, 2)}h prefix)`, length: 1, undocumented: true };
    }
    op = next;
    pos = 2;
    [text, length, , undocumented] = info;
    length += 1;
  } else if (op === 0xcb) {
    const [t, , u] = zCB(at(1), 0);
    return zFinish(at, addr, 2, t, u, {});
  } else if (op === 0xed) {
    const e = zED(at(1));
    if (!e) return { addr, bytes: [0xed, at(1)], text: 'NOP', length: 2, undocumented: true };
    return zFinish(at, addr, e[1], e[0], e[3], { from: 2 });
  } else {
    [text, length, , undocumented] = zMain(op, 0);
  }
  // operands follow the opcode: the displacement first, then n or nn
  const o = { from: pos };
  if (text.includes('{d}')) { o.d = at(pos); o.from = pos + 1; }
  return zFinish(at, addr, length, text, undocumented, o);
}

function zFinish(at, addr, length, text, undocumented, { d, from = 2 }) {
  const bytes = [];
  for (let i = 0; i < length; i++) bytes.push(at(i));
  if (d !== undefined) text = text.replace('+{d}', d & 0x80 ? `-${zhex(0x100 - d, 2)}h` : `+${zhex(d, 2)}h`);
  if (text.includes('{nn}')) text = text.replace('{nn}', zhex(at(from) | (at(from + 1) << 8), 4) + 'h');
  else if (text.includes('{n}')) text = text.replace('{n}', zhex(at(from), 2) + 'h');
  if (text.includes('{e}')) {
    const e = at(from);
    text = text.replace('{e}', zhex((addr + length + (e & 0x80 ? e - 0x100 : e)) & 0xffff, 4) + 'h');
  }
  return { addr, bytes, text, length, undocumented };
}
