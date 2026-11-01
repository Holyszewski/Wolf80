// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Memory files: merging the address ranges reported after a load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blockRanges, parseIntelHex, toIntelHex } from '../src/machine/memfile.js';

test('blockRanges merges the records of one Intel HEX file into one range', () => {
  const blocks = parseIntelHex(toIntelHex(0x1c00, new Uint8Array(597)));
  assert.equal(blocks.length, 38);
  assert.deepEqual(blockRanges(blocks), [{ from: 0x1c00, to: 0x1e54 }]);
});

test('blockRanges keeps real gaps, merges overlaps and sorts', () => {
  const b = (addr, n) => ({ addr, bytes: new Uint8Array(n) });
  assert.deepEqual(blockRanges([b(0x1d00, 4), b(0x1c00, 16), b(0x1c08, 16), b(0x1c18, 2), b(0x1e00, 0)]),
    [{ from: 0x1c00, to: 0x1c19 }, { from: 0x1d00, to: 0x1d03 }]);
  assert.deepEqual(blockRanges([b(0xfffe, 4)]), [{ from: 0xfffe, to: 0xffff }]);
  assert.deepEqual(blockRanges([]), []);
});
