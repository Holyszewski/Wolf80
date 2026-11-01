// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Two-pass 8080 assembler, Intel syntax. The base of the future development environment.
//
//   label: MNEMONIC operands ; comment
//   NAME EQU expr        ORG expr        DB expr|'text',...     DW expr,...     DS expr     END
// Directives may also be written with a leading dot (.ORG, .DB ...), as TASM does.
// Numbers: decimal, 0FFh / 1C00H (must start with a digit), $1C00, 0x1C00, 1010b, 'A'.
// $ alone is the address of the current line. Operators: + - * / % & | ^ << >>, unary - and ~,
// parentheses, HIGH(x) and LOW(x).
//
// assemble(source) -> { blocks: [{ addr, bytes }], listing, symbols, errors }

import { I8080_OPCODES } from '../core/i8080-disasm.js';

const NAMES = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L', 'M', 'SP', 'PSW']);

// "MVI A,#1" -> opcode; #1 is a byte operand, #2 a word operand. Undocumented copies are left out.
const ENCODE = new Map();
for (const o of I8080_OPCODES) {
  if (o.undocumented) continue;
  const key = o.text.replace('nnnn', '#2').replace('nn', '#1');
  if (!ENCODE.has(key)) ENCODE.set(key, o.op);
}

const DIRECTIVES = ['EQU', 'ORG', 'END', 'DB', 'DW', 'DS'];
const KEYWORDS = new Set([...[...ENCODE.keys()].map(k => k.split(' ')[0]), 'RST', ...DIRECTIVES]);

class AsmError extends Error {}

function parseNumber(tok) {
  let m;
  if ((m = /^[0-9][0-9A-F]*H$/i.exec(tok))) return parseInt(tok.slice(0, -1), 16);
  if ((m = /^\$([0-9A-F]+)$/i.exec(tok))) return parseInt(m[1], 16);
  if ((m = /^0X([0-9A-F]+)$/i.exec(tok))) return parseInt(m[1], 16);
  if ((m = /^([01]+)B$/i.exec(tok))) return parseInt(m[1], 2);
  if (/^[0-9]+D?$/i.test(tok)) return parseInt(tok, 10);
  return null;
}

// Expression evaluator. `lookup(name)` returns a value or undefined.
function evaluate(text, lookup, here) {
  const toks = text.match(/'(?:[^']|'')'|<<|>>|[A-Za-z_?@.][\w?@.]*|\$[0-9A-Fa-f]+|\$|0[xX][0-9A-Fa-f]+|[0-9][0-9A-Za-z]*|[-+*/%&|^~()]|\S/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  function primary() {
    const t = next();
    if (t === undefined) throw new AsmError('expression expected');
    if (t === '(') { const v = expr(); if (next() !== ')') throw new AsmError('")" expected'); return v; }
    if (t === '-') return -primary();
    if (t === '+') return primary();
    if (t === '~') return ~primary();
    if (t === '$') return here;
    if (t[0] === "'") { const s = t.slice(1, -1).replace("''", "'"); return s.charCodeAt(0); }
    const n = parseNumber(t);
    if (n !== null) return n;
    const up = t.toUpperCase();
    if ((up === 'HIGH' || up === 'LOW') && peek() === '(') { const v = primary(); return up === 'HIGH' ? (v >> 8) & 0xff : v & 0xff; }
    if (/^[A-Za-z_?@.]/.test(t)) {
      const v = lookup(up);
      if (v === undefined) throw new AsmError(`unknown symbol ${t}`);
      return v;
    }
    throw new AsmError(`unexpected "${t}"`);
  }
  const LEVELS = [['|'], ['^'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  function level(n) {
    if (n === LEVELS.length) return primary();
    let v = level(n + 1);
    while (LEVELS[n].includes(peek())) {
      const op = next(), r = level(n + 1);
      switch (op) {
        case '|': v |= r; break;
        case '^': v ^= r; break;
        case '&': v &= r; break;
        case '<<': v <<= r; break;
        case '>>': v >>= r; break;
        case '+': v += r; break;
        case '-': v -= r; break;
        case '*': v *= r; break;
        case '/': if (!r) throw new AsmError('division by zero'); v = Math.trunc(v / r); break;
        default: if (!r) throw new AsmError('division by zero'); v %= r;
      }
    }
    return v;
  }
  const expr = () => level(0);
  const v = expr();
  if (i < toks.length) throw new AsmError(`unexpected "${toks[i]}"`);
  return v;
}

// Splits operands at commas outside quotes and parentheses.
function splitOperands(s) {
  const out = [];
  let cur = '', depth = 0, q = false;
  for (const ch of s) {
    if (ch === "'") q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && depth === 0 && ch === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '' || out.length) out.push(cur.trim());
  return out;
}

function stripComment(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'") q = !q;
    if (line[i] === ';' && !q) return line.slice(0, i);
  }
  return line;
}

export function assemble(source) {
  const lines = source.split(/\r?\n/);
  const symbols = new Map();
  let errors = [], listing = [], blocks = [];

  for (const pass of [1, 2]) {
    let pc = 0, block = null;
    errors = []; listing = []; blocks = [];
    const lookup = name => symbols.get(name) ?? (pass === 1 ? 0 : undefined);
    const emit = bytes => {
      if (!block || block.addr + block.bytes.length !== pc) { block = { addr: pc, bytes: [] }; blocks.push(block); }
      for (const b of bytes) block.bytes.push(b & 0xff);
      pc = (pc + bytes.length) & 0xffff;
    };
    for (let n = 0; n < lines.length; n++) {
      const text = lines[n];
      const start = pc;
      let bytes = [];
      try {
        const raw = stripComment(text);
        let s = raw.trim();
        let label = null;
        const lm = /^([A-Za-z_?@.][\w?@.]*):/.exec(s);
        if (lm) {
          label = lm[1].toUpperCase(); s = s.slice(lm[0].length).trim();
        } else {
          // A label without a colon: a name in the first column that is not a keyword, or any
          // name followed by EQU, DB, DW or DS.
          const bare = /^([A-Za-z_?@.][\w?@.]*)(?=\s|$)/.exec(s);
          const word = bare && bare[1].toUpperCase();
          const nextWord = bare && (/^\s*\.?([A-Za-z]+)/.exec(s.slice(bare[0].length)) || [])[1];
          if (bare && ((/^[A-Za-z_?@.]/.test(raw) && !KEYWORDS.has(word.replace(/^\./, ''))) ||
              (nextWord && ['EQU', 'DB', 'DW', 'DS'].includes(nextWord.toUpperCase())))) {
            label = word; s = s.slice(bare[0].length).trim();
          }
        }
        const mm = /^(\.?[A-Za-z]+)\s*(.*)$/.exec(s);
        const mnem = mm ? mm[1].toUpperCase().replace(/^\./, '') : '';
        const args = mm ? mm[2].trim() : '';
        if (label && mnem !== 'EQU') {
          if (pass === 1 && symbols.has(label)) throw new AsmError(`${label} defined twice`);
          symbols.set(label, pc);
        }
        if (!s) { listing.push({ line: n + 1, addr: start, bytes, text }); continue; }
        switch (mnem) {
          case 'EQU':
            if (!label) throw new AsmError('EQU needs a name');
            if (pass === 1 && symbols.has(label)) throw new AsmError(`${label} defined twice`);
            symbols.set(label, evaluate(args, lookup, pc) & 0xffff);
            break;
          case 'ORG': // a label on an ORG line gets the new address, as in TASM
            pc = evaluate(args, lookup, pc) & 0xffff;
            block = null;
            if (label) symbols.set(label, pc);
            break;
          case 'END': n = lines.length; break;
          case 'DB':
            for (const a of splitOperands(args)) {
              if (/^'.{2,}'$/.test(a)) bytes.push(...[...a.slice(1, -1).replace(/''/g, "'")].map(c => c.charCodeAt(0)));
              else bytes.push(evaluate(a, lookup, pc));
            }
            break;
          case 'DW':
            for (const a of splitOperands(args)) { const v = evaluate(a, lookup, pc); bytes.push(v & 0xff, (v >> 8) & 0xff); }
            break;
          case 'DS': pc = (pc + evaluate(args, lookup, pc)) & 0xffff; block = null; break;
          default: {
            const ops = splitOperands(args);
            const values = [];
            let key = mnem;
            if (mnem === 'RST') {
              key = `RST ${evaluate(args, lookup, pc)}`;
            } else if (ops.length) {
              key += ' ' + ops.map(o => {
                if (NAMES.has(o.toUpperCase())) return o.toUpperCase();
                values.push(o);
                return '#';
              }).join(',');
            }
            let op;
            for (const size of ['#1', '#2']) {
              const k = key.replace('#', size);
              if (ENCODE.has(k)) { op = ENCODE.get(k); key = k; break; }
            }
            if (op === undefined && ENCODE.has(key)) op = ENCODE.get(key);
            if (op === undefined) throw new AsmError(`unknown instruction "${s}"`);
            bytes.push(op);
            if (key.includes('#1')) {
              const v = evaluate(values[0], lookup, pc);
              if (pass === 2 && (v < -128 || v > 255)) throw new AsmError(`byte out of range: ${v}`);
              bytes.push(v & 0xff);
            } else if (key.includes('#2')) {
              const v = evaluate(values[0], lookup, pc);
              bytes.push(v & 0xff, (v >> 8) & 0xff);
            }
          }
        }
      } catch (e) {
        if (!(e instanceof AsmError)) throw e;
        if (pass === 2) errors.push({ line: n + 1, message: e.message });
      }
      if (bytes.length) emit(bytes);
      listing.push({ line: n + 1, addr: start, bytes, text });
    }
  }
  return {
    blocks: blocks.map(b => ({ addr: b.addr, bytes: Uint8Array.from(b.bytes) })),
    listing,
    symbols: Object.fromEntries(symbols),
    errors,
  };
}
