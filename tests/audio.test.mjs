// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
import test from 'node:test';
import assert from 'node:assert/strict';
import { EdgeRecorder, renderEdges, createAudioState } from '../src/machine/audio-render.js';

const CLOCK = 10e6 / 9;

test('a square wave on the output becomes a tone of the same pitch without DC', () => {
  const rec = new EdgeRecorder(0, 0);
  const half = CLOCK / 440 / 2;
  const total = Math.round(CLOCK); // one second
  for (let t = half, level = 1; t < total; t += half, level ^= 1) rec.set(level, Math.round(t));
  const state = createAudioState(0);
  // render in frame-sized chunks, as the UI does
  const parts = [];
  const chunkStates = Math.round(CLOCK / 60);
  const all = rec.take(total);
  for (let from = 0; from < total; from += chunkStates) {
    const to = Math.min(total, from + chunkStates);
    const edges = all.edges.filter(t => t > from && t <= to);
    const startLevel = all.edges.filter(t => t <= from).length % 2;
    parts.push(renderEdges({ from, to, startLevel, edges }, CLOCK, 48000, state));
  }
  const pcm = Float32Array.from(parts.flatMap(p => [...p]));
  assert.ok(Math.abs(pcm.length - 48000) <= 1, `samples ${pcm.length}`);
  const tail = pcm.subarray(24000); // after the DC blocker settles
  let crossings = 0;
  for (let i = 1; i < tail.length; i++) if ((tail[i - 1] < 0) !== (tail[i] < 0)) crossings++;
  const hz = crossings / 2 / (tail.length / 48000);
  assert.ok(Math.abs(hz - 440) < 3, `${hz} Hz`);
  const mean = tail.reduce((s, v) => s + v, 0) / tail.length;
  assert.ok(Math.abs(mean) < 0.01, `DC ${mean}`);
  assert.ok(Math.max(...tail) <= 0.3 && Math.min(...tail) >= -0.3);
});

test('a constant level is silent', () => {
  const state = createAudioState(0);
  renderEdges({ from: 0, to: 100000, startLevel: 1, edges: [] }, CLOCK, 48000, state);
  const pcm = renderEdges({ from: 100000, to: 2000000, startLevel: 1, edges: [] }, CLOCK, 48000, state);
  assert.ok(Math.max(...pcm.map(Math.abs)) < 0.05);
});
