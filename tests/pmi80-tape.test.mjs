// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Tape recordings in the factory monitor's format, checked against its own SAVE and LOAD.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pmi80, PMI80_CLOCK_HZ } from '../src/board/pmi80.js';
import { pmi80TapeBlocks, pmi80TapeSignal, pmi80TapeWav, wavFile } from '../src/board/pmi80-tape.js';

const ROM = fs.readFileSync(new URL('../roms/pmi80/pmi80_monitor.bin', import.meta.url));
const ms = t => Math.round(t * PMI80_CLOCK_HZ / 1000);
const DATA = [0x00, 0xff, 0x55, 0xaa, 0x01, 0x80, 0x36, 0x07, 0xc3, 0x00, 0x1c, 0x76, 0x3e, 0x8a, 0xd3, 0xfb];

function tap(pmi, key) {
  pmi.pressKey(key);
  pmi.run(ms(60));
  pmi.releaseKey(key);
  pmi.run(ms(60));
}

// From the greeting: the command (S or L), the address, =, the block number, =.
function command(pmi, cmd, addr, number) {
  pmi.run(ms(50));
  for (const k of ['=', cmd, ...addr, '=', ...number, '=']) tap(pmi, k);
}

// Steps until the monitor reaches `pc` (0386h: SAVE or LOAD has finished and shows MG STOP).
function runTo(pmi, pc, limit) {
  const end = pmi.cycles + limit;
  while (pmi.cpu.pc !== pc && pmi.cycles < end) pmi.cpu.step();
  return pmi.cpu.pc === pc;
}

// Edges of MG OUT (high unless the burst is on and PA6 is high) from pmi80TapeSignal.
function mgOutEdges(signal) {
  const edges = [];
  let mg = 1;
  signal.times.forEach((t, i) => {
    const v = signal.levels[i] === -1 ? 0 : 1;
    if (v !== mg) { edges.push(t); mg = v; }
  });
  return edges;
}

test('SAVE records from the address to the end of its page; a range is split into numbered blocks', () => {
  assert.deepEqual(pmi80TapeBlocks(0x1c00, 0x1c3f, 5), [{ addr: 0x1c00, number: 5, length: 256 }]);
  assert.deepEqual(pmi80TapeBlocks(0x1cf0, 0x1e00, 0xff), [
    { addr: 0x1cf0, number: 0xff, length: 16 },
    { addr: 0x1d00, number: 0x00, length: 256 },
    { addr: 0x1e00, number: 0x01, length: 256 },
  ]);
  assert.equal(pmi80TapeBlocks(0x1c00, 0x1fff).length, 4);
});

test('the signal has the same edges, state for state, as the factory SAVE', () => {
  const pmi = new Pmi80({ rom: ROM });
  DATA.forEach((v, i) => pmi.write(0x1cf0 + i, v));
  command(pmi, 'S', '1CF0', '07');
  pmi.takeAudio();
  tap(pmi, '='); // any key starts the recording
  assert.ok(runTo(pmi, 0x0386, ms(5000)), 'SAVE did not finish');
  const got = pmi.takeAudio().edges;
  const want = mgOutEdges(pmi80TapeSignal(0x07, DATA));
  assert.equal(got.length, want.length);
  assert.deepEqual(got.map(t => t - got[0]), want);
});

test('the factory LOAD reads the signal back', () => {
  const signal = pmi80TapeSignal(0x07, DATA);
  const pmi = new Pmi80({ rom: ROM });
  command(pmi, 'L', '1CF0', '07');
  // MG IN as the LOAD code reads it: PC7 is 1 while the burst is on, 0 in silence
  const start = pmi.cycles + ms(300);
  const burst = t => {
    let lo = 0, hi = signal.times.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (signal.times[mid] <= t) lo = mid + 1; else hi = mid; }
    return lo > 0 && t < signal.end && signal.levels[lo - 1] !== 0;
  };
  const keyboard = pmi.portCInput.bind(pmi);
  pmi.portCInput = () => (keyboard() & 0x7f) | (burst(pmi.cycles - start) ? 0x80 : 0);
  tap(pmi, '=');
  assert.ok(runTo(pmi, 0x0386, ms(5000)), 'LOAD did not finish');
  assert.deepEqual([...pmi.ram.subarray(0xf0, 0x100)], DATA);
});

test('a byte takes about 78 ms and the leader about 21 ms, as the manual says', () => {
  const one = pmi80TapeSignal(0, [0]).end, two = pmi80TapeSignal(0, [0, 0]).end;
  const byteMs = (two - one) / PMI80_CLOCK_HZ * 1000;
  assert.ok(Math.abs(byteMs - 78.3) < 0.1, `${byteMs} ms`);
  const leaderMs = 240 * 99 / PMI80_CLOCK_HZ * 1000;
  assert.ok(Math.abs(leaderMs - 21.4) < 0.1, `${leaderMs} ms`);
});

test('the WAV file: header, length, silence between blocks, full level in the burst', () => {
  const header = wavFile(new Float32Array([0, 1, -1]), 8000);
  const v = new DataView(header.buffer);
  assert.equal(new TextDecoder().decode(header.subarray(0, 4)), 'RIFF');
  assert.equal(v.getUint32(4, true), header.length - 8);
  assert.equal(v.getUint32(24, true), 8000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 6);
  assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)], [0, 32767, -32767]);

  const blocks = [{ number: 0, bytes: [1, 2] }, { number: 1, bytes: [3] }];
  const { wav, seconds } = pmi80TapeWav(blocks, { leadIn: 1, gap: 2, tail: 1 });
  const pcm = new Int16Array(wav.buffer.slice(44));
  assert.equal(pcm.length, Math.round(seconds * 44100));
  const signalSeconds = blocks.reduce((s, b) => s + pmi80TapeSignal(b.number, b.bytes).end / PMI80_CLOCK_HZ, 0);
  assert.ok(Math.abs(seconds - (4 + signalSeconds)) < 0.001);
  assert.ok(pcm.subarray(0, 44100).every(x => x === 0), 'lead-in is silent');
  const leader = pcm.subarray(44100, 44100 + 800);
  assert.ok(Math.max(...leader) > 0.8 * 32767 && Math.min(...leader) < -0.8 * 32767);
  const firstEnd = 44100 + Math.ceil(pmi80TapeSignal(0, [1, 2]).end / (PMI80_CLOCK_HZ / 44100));
  assert.ok(pcm.subarray(firstEnd, firstEnd + 2 * 44100).every(x => x === 0), 'gap is silent');
});
