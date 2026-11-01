// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
import test from 'node:test';
import assert from 'node:assert/strict';
import { I8255 } from '../src/machine/i8255.js';

test('after reset all ports are inputs and read the pins', () => {
  const ppi = new I8255({ inputA: () => 0x12, inputB: () => 0x34, inputC: () => 0x56 });
  assert.deepEqual([ppi.read(0), ppi.read(1), ppi.read(2)], [0x12, 0x34, 0x56]);
  assert.deepEqual([ppi.outputA(), ppi.outputB(), ppi.outputC()], [0xff, 0xff, 0xff]);
});

test('mode 8Ah: PA out, PB in, PC0-3 out, PC4-7 in', () => {
  let changes = 0;
  const ppi = new I8255({ inputB: () => 0xa5, inputC: () => 0x9f, onOutput: () => changes++ });
  ppi.write(3, 0x8a);
  ppi.write(0, 0x40);
  ppi.write(2, 0x0e);
  assert.equal(ppi.outputA(), 0x40);
  assert.equal(ppi.read(1), 0xa5);
  assert.equal(ppi.read(2), 0x9e); // upper half from the pins, lower half from the latch
  assert.equal(ppi.outputC(), 0xfe);
  assert.equal(changes, 3);
});

test('a mode change clears the output latches; bit set/reset changes one bit of PC', () => {
  const ppi = new I8255();
  ppi.write(3, 0x80);
  ppi.write(0, 0x55);
  ppi.write(2, 0xf0);
  ppi.write(3, 0x80);
  assert.deepEqual([ppi.outputA(), ppi.outputC()], [0x00, 0x00]);
  ppi.write(3, 0x07); // set PC3
  ppi.write(3, 0x0f); // set PC7
  ppi.write(3, 0x0e); // reset PC7
  assert.equal(ppi.outputC(), 0x08);
});
