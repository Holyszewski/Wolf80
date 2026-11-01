// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Tape recordings in the format of the PMI-80 factory monitor: the signal its SAVE command
// (034Ch) sends to MG OUT on K3, as a WAV file that can be played into MG IN of a real PMI-80 and
// loaded there with the factory LOAD command (038Ch). The signal is computed here, state by
// state, from the monitor's code; it does not need the monitor in the emulator (tests check it
// against the factory SAVE and LOAD). See docs/pmi80.md (Tape) for the format.

import { PMI80_CLOCK_HZ } from './pmi80.js';

// The tone loop at 02F0h: OUT F8h, a delay, XRI 40h (PA6, the burst), 99 states per pass.
const TAPE_HALF = 99;
const TAPE_CELL_HALVES = 32;    // MVI D,20h at 02EEh: one start, data or stop cell
const TAPE_LEADER_HALVES = 240; // MVI D,0F0h at 0368h

// States from the last port write of one tone call to the first write of the next: the rest of
// the loop and RET (99), the code in between, then CALL 02EEh, MVI D and OUT (34).
const TAPE_GAP = {
  leaderToByte: 99 + 49 + 34,  // LDA 1FFAh, MOV C,A, CALL TOUT, MVI B,9, MVI A,0C7h
  startToData: 99 + 25 + 34,   // MOV A,C, RAR, MOV C,A, MVI A,8Fh, RAR
  dataToStop: 99 + 7 + 34,     // MVI A,47h
  stopToStart: 99 + 22 + 34,   // DCR B, JNZ, MVI A,0C7h
  // after the block number: DCR B, JNZ, RET, MVI A,10h, CALL CLEAR (457 states with its RET),
  // LHLD 1FF8h, MOV C,M, CALL TOUT, MVI B,9, MVI A,0C7h
  numberToData: 99 + 543 + 34,
  byteToByte: 99 + 78 + 34,    // DCR B, JNZ, RET, INR L, JNZ, MOV C,M, CALL TOUT, MVI B,9, MVI A,0C7h
};

export const PMI80_TAPE_RATE = 44100;
export const PMI80_TAPE_MAX_BLOCKS = 16;

// The blocks the factory SAVE would record for the range from-to: SAVE always goes on to the end
// of the 256-byte page (it stops when L wraps to 00h), so a range is split at page boundaries and
// its last page is recorded whole. Block numbers go up from `number`.
export function pmi80TapeBlocks(from, to, number = 0) {
  const blocks = [];
  for (let addr = from; addr <= to; addr = (addr | 0xff) + 1) {
    blocks.push({ addr, number: (number + blocks.length) & 0xff, length: 0x100 - (addr & 0xff) });
  }
  return blocks;
}

// The signal of one SAVE as level changes { times, levels, end } in CPU states from the first
// edge of the leader. Level -1 or +1: the burst is on (PA7 = 1, MG OUT = NAND of PA6 and PA7
// follows PA6); 0: no burst (PA7 = 0, MG OUT stays high), which a tape recorder plays back as
// silence. TOUT (02D4h) sends a byte as nine cells, bits 0-7 and a ninth 0 that the reader uses to
// find the next byte; a cell is a start part with the burst, a data part with the burst for 1 and
// without it for 0, and a stop part without it.
export function pmi80TapeSignal(number, bytes) {
  const times = [], levels = [];
  let t = 0, last = 0;
  const put = (time, level) => {
    if (levels.length && levels[levels.length - 1] === level) return;
    times.push(time); levels.push(level);
  };
  // one call of the tone loop; the first write has PA6 = 1, so MG OUT starts low
  const tone = (burst, halves) => {
    for (let k = 0; k < halves; k++) put(t + k * TAPE_HALF, burst ? (k & 1 ? 1 : -1) : 0);
    last = t + (halves - 1) * TAPE_HALF;
  };
  const sendByte = value => {
    for (let cell = 0; cell < 9; cell++) {
      if (cell) t = last + TAPE_GAP.stopToStart;
      tone(true, TAPE_CELL_HALVES);
      t = last + TAPE_GAP.startToData;
      tone(cell < 8 && (value >> cell) & 1, TAPE_CELL_HALVES);
      t = last + TAPE_GAP.dataToStop;
      tone(false, TAPE_CELL_HALVES);
    }
  };
  tone(true, TAPE_LEADER_HALVES);
  t = last + TAPE_GAP.leaderToByte;
  sendByte(number & 0xff);
  bytes.forEach((v, i) => {
    t = last + (i ? TAPE_GAP.byteToByte : TAPE_GAP.numberToData);
    sendByte(v);
  });
  return { times, levels, end: last + TAPE_HALF };
}

// A signal from pmi80TapeSignal as samples: the mean level over each sample (box filter).
function tapeSamples(signal, out, at, clockHz, sampleRate, amplitude) {
  const len = clockHz / sampleRate;
  const { times, levels, end } = signal;
  const n = Math.ceil(end / len);
  let i = 0;
  for (let s = 0; s < n; s++) {
    const a = s * len, b = a + len;
    let level = i ? levels[i - 1] : 0, from = a, acc = 0;
    while (i < times.length && times[i] < b) {
      if (times[i] > from) acc += level * (times[i] - from);
      from = Math.max(from, times[i]);
      level = levels[i++];
    }
    acc += level * (b - from);
    out[at + s] = amplitude * acc / len;
  }
  return n;
}

// A whole recording: `leadIn` seconds of silence, the blocks [{ number, bytes }] with `gap`
// seconds of silence between them (time to type the next LOAD on the real machine), and `tail`
// seconds of silence. Returns { wav: Uint8Array (16-bit mono PCM), seconds }.
export function pmi80TapeWav(blocks, { clockHz = PMI80_CLOCK_HZ, sampleRate = PMI80_TAPE_RATE,
  leadIn = 2, gap = 20, tail = 1, amplitude = 0.9 } = {}) {
  const signals = blocks.map(b => pmi80TapeSignal(b.number, b.bytes));
  const sec = s => Math.round(s * sampleRate);
  const total = sec(leadIn) + sec(tail) + sec(gap) * (blocks.length - 1)
    + signals.reduce((n, s) => n + Math.ceil(s.end / (clockHz / sampleRate)), 0);
  const pcm = new Float32Array(total);
  let at = sec(leadIn);
  signals.forEach((s, i) => {
    if (i) at += sec(gap);
    at += tapeSamples(s, pcm, at, clockHz, sampleRate, amplitude);
  });
  return { wav: wavFile(pcm, sampleRate), seconds: total / sampleRate };
}

// RIFF WAVE, PCM, 16 bits, one channel.
export function wavFile(samples, sampleRate) {
  const data = samples.length * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const ascii = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF'); v.setUint32(4, 36 + data, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, 'data'); v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  }
  return new Uint8Array(buf);
}
