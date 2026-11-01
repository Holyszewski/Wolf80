// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Program and memory files: Intel HEX and plain hex text.

// Parses Intel HEX (record types 00 data and 01 end). Returns blocks [{ addr, bytes }].
export function parseIntelHex(text) {
  const blocks = [];
  let line = 0;
  for (const raw of text.split(/\r?\n/)) {
    line++;
    const s = raw.trim();
    if (!s) continue;
    if (!/^:[0-9A-Fa-f]+$/.test(s) || s.length < 11 || s.length % 2 === 0) {
      throw new Error(`line ${line}: not an Intel HEX record`);
    }
    const b = [];
    for (let i = 1; i < s.length; i += 2) b.push(parseInt(s.slice(i, i + 2), 16));
    const count = b[0], addr = (b[1] << 8) | b[2], type = b[3];
    if (b.length !== count + 5) throw new Error(`line ${line}: wrong record length`);
    if (b.reduce((sum, v) => sum + v, 0) & 0xff) throw new Error(`line ${line}: wrong checksum`);
    if (type === 1) break;
    if (type !== 0) continue; // extended address records are not used by 64 KiB machines
    blocks.push({ addr, bytes: Uint8Array.from(b.slice(4, 4 + count)) });
  }
  return blocks;
}

// Plain hex: pairs of hex digits, whitespace ignored.
export function parsePlainHex(text) {
  const digits = text.replace(/\s+/g, '');
  if (!/^([0-9A-Fa-f]{2})*$/.test(digits)) throw new Error('only pairs of hex digits are allowed');
  return Uint8Array.from(digits.match(/../g) || [], h => parseInt(h, 16));
}

// Address ranges covered by blocks [{ addr, bytes }], sorted, with adjacent and overlapping
// ranges merged: [{ from, to }] (inclusive). Blocks do not wrap past FFFF.
export function blockRanges(blocks) {
  const spans = blocks.filter(b => b.bytes.length > 0)
    .map(b => ({ from: b.addr, to: Math.min(0xffff, b.addr + b.bytes.length - 1) }))
    .sort((a, b) => a.from - b.from);
  const out = [];
  for (const r of spans) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to + 1) last.to = Math.max(last.to, r.to);
    else out.push({ ...r });
  }
  return out;
}

// Intel HEX of blocks [{ addr, bytes }]: 16 data bytes per record, one end record.
export function toIntelHexBlocks(blocks) {
  const hex2 = v => v.toString(16).toUpperCase().padStart(2, '0');
  const lines = [];
  for (const { addr, bytes } of blocks) {
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk = bytes.slice(i, i + 16);
      const a = (addr + i) & 0xffff;
      const rec = [chunk.length, a >> 8, a & 0xff, 0, ...chunk];
      const sum = (-rec.reduce((s, v) => s + v, 0)) & 0xff;
      lines.push(':' + rec.map(hex2).join('') + hex2(sum));
    }
  }
  lines.push(':00000001FF');
  return lines.join('\n') + '\n';
}

export function toIntelHex(addr, bytes) {
  return toIntelHexBlocks([{ addr, bytes }]);
}
