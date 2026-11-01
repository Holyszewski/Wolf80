// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Turns the level changes of a one-bit audio output (in CPU states) into PCM samples.
// Pure functions, testable without a browser.

// Edge recorder kept by a board: the level at `from` and the times of every change since.
export class EdgeRecorder {
  constructor(level = 0, time = 0) {
    this.level = level;
    this.startLevel = level;
    this.from = time;
    this.edges = [];
  }

  set(level, time) {
    if (level === this.level) return;
    this.level = level;
    this.edges.push(time);
  }

  // Returns { from, to, startLevel, edges } and starts the next chunk at `time`.
  take(time) {
    const chunk = { from: this.from, to: time, startLevel: this.startLevel, edges: this.edges };
    this.from = time;
    this.startLevel = this.level;
    this.edges = [];
    return chunk;
  }
}

// pos: start of the sample being accumulated (states), acc: time at level 1 inside it.
export function createAudioState(startTime = 0) {
  return { pos: startTime, acc: 0, lp: 0, hpX: 0, hpY: 0 };
}

// chunk from EdgeRecorder.take(); chunks must follow each other. Each sample is the mean level
// over its interval (box filter), then a one-pole low-pass that stands for the shaping of the
// square wave into a "roughly sinusoidal" signal, then a DC blocker for the AC-coupled
// amplifier input. The filter corners are assumptions, not measured values.
export function renderEdges(chunk, clockHz, sampleRate, state, { gain = 0.25, lowPassHz = 5000 } = {}) {
  const len = clockHz / sampleRate;
  if (state.pos < chunk.from - len || state.pos > chunk.to) { state.pos = chunk.from; state.acc = 0; }
  const out = [];
  const edges = chunk.edges;
  let level = chunk.startLevel, t = Math.max(chunk.from, state.pos), ei = 0;
  while (ei < edges.length && edges[ei] <= t) { level ^= 1; ei++; }
  const a = 1 - Math.exp(-2 * Math.PI * lowPassHz / sampleRate);
  const R = 0.995;
  for (;;) {
    const end = state.pos + len;
    if (end > chunk.to) break;
    while (ei < edges.length && edges[ei] <= end) {
      if (level) state.acc += edges[ei] - t;
      t = edges[ei]; level ^= 1; ei++;
    }
    if (level) state.acc += end - t;
    t = end;
    const x = Math.min(1, Math.max(0, state.acc / len));
    state.lp += a * (x - state.lp);
    const y = state.lp - state.hpX + R * state.hpY;
    state.hpX = state.lp; state.hpY = y;
    out.push(y * gain);
    state.pos = end; state.acc = 0;
  }
  while (ei < edges.length && edges[ei] <= chunk.to) {
    if (level) state.acc += edges[ei] - t;
    t = edges[ei]; level ^= 1; ei++;
  }
  if (level) state.acc += chunk.to - t;
  return Float32Array.from(out);
}
