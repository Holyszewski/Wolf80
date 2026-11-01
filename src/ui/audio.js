// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Web Audio output of the virtual amplifier. Chunks are scheduled back to back; the queue ahead
// of the audio clock is bounded, and sound never slows the CPU down.

import { renderEdges, createAudioState } from '../machine/audio-render.js';

const LEAD_S = 0.04;      // start this far ahead of the audio clock after a gap
const MAX_AHEAD_S = 0.09; // never queue more than this

export class AudioOut {
  constructor(clockHz) {
    this.clockHz = clockHz;
    this.ctx = null;
    this.enabled = false;
    this.cursor = 0;
    this.state = null;
  }

  async enable() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) throw new Error('Prohlížeč nepodporuje Web Audio.');
      this.ctx = new AC({ latencyHint: 'interactive' });
    }
    await this.ctx.resume();
    this.enabled = true;
    this.reset();
  }

  disable() {
    this.enabled = false;
    if (this.ctx) this.ctx.suspend();
  }

  // Forget the history (new machine, pause, hidden page).
  reset() {
    this.state = null;
    this.cursor = 0;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // chunk from the board's takeAudio(); call every frame, also when muted.
  push(chunk, maxAhead = MAX_AHEAD_S) {
    if (!this.enabled || !this.running) { this.state = null; return; }
    if (!this.state) this.state = createAudioState(chunk.from);
    const sr = this.ctx.sampleRate;
    let samples = renderEdges(chunk, this.clockHz, sr, this.state);
    if (!samples.length) return;
    const now = this.ctx.currentTime;
    if (this.cursor < now + 0.005) this.cursor = now + LEAD_S;
    const excess = Math.floor((this.cursor + samples.length / sr - now - maxAhead) * sr);
    if (excess > 0) {
      if (excess >= samples.length) return;
      samples = samples.subarray(excess);
    }
    const buf = this.ctx.createBuffer(1, samples.length, sr);
    buf.copyToChannel(samples, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(this.cursor);
    this.cursor += samples.length / sr;
  }
}
