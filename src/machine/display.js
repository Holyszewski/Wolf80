// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Multiplexed seven-segment display. Only one digit is selected at a time, so what a viewer
// sees is how long each segment was lit. The board reports every change of the selected digit
// and its lit segments with a timestamp in CPU states; takeFrame() returns the accumulated
// on-time of every segment since the previous frame. Brightness is on-time / frame duration.

export class MuxDisplay {
  constructor(digits) {
    this.digits = digits;
    this.on = new Float64Array(digits * 8); // [digit * 8 + segment], segment 0 = a ... 6 = g
    this.digit = -1;   // selected digit, -1 = none
    this.lit = 0;      // lit segments of the selected digit, bit 0 = a ... bit 6 = g
    this.since = 0;    // time of the last change
    this.frameStart = 0;
  }

  // digit: 0..digits-1, or -1 when no digit is selected; lit: bit mask of lit segments.
  set(digit, lit, now) {
    this.accumulate(now);
    this.digit = digit;
    this.lit = lit;
  }

  accumulate(now) {
    const dt = now - this.since;
    if (dt > 0 && this.lit && this.digit >= 0 && this.digit < this.digits) {
      const base = this.digit * 8;
      for (let s = 0; s < 8; s++) if (this.lit & (1 << s)) this.on[base + s] += dt;
    }
    this.since = now;
  }

  // Returns { duration, on } for the time since the previous frame and starts a new one.
  takeFrame(now) {
    this.accumulate(now);
    const frame = { duration: now - this.frameStart, on: this.on.slice() };
    this.on.fill(0);
    this.frameStart = now;
    return frame;
  }
}

// Brightness as the eye sees it: the lit share of every segment, smoothed exponentially over
// simulated time with the time constant `tau` (in CPU states). Without it, software PWM whose
// period does not fit a whole number of times into one screen frame beats against the frame
// rate and flickers, which a real display does not. While the machine stands still (a frame of
// zero duration) the brightness is held; after a restart (time going back) or reset() the next
// frame is taken as it is.
export class Glow {
  constructor(size, tau) {
    this.level = new Float64Array(size);
    this.tau = tau;
    this.time = null;
  }

  reset() {
    this.time = null;
  }

  // frame: from MuxDisplay.takeFrame(); now: the time the frame ends. Returns the levels 0..1.
  update(frame, now) {
    if (frame.duration <= 0) return this.level;
    const span = this.time === null || now < this.time ? Infinity : now - this.time;
    this.time = now;
    const k = 1 - Math.exp(-span / this.tau);
    for (let i = 0; i < this.level.length; i++) {
      this.level[i] += (frame.on[i] / frame.duration - this.level[i]) * k;
    }
    return this.level;
  }
}

// Segments of every digit lit for more than `threshold` of the brightest segment's on-time,
// as bit masks (bit 0 = a). Useful for tests and for a plain "is it lit" view.
export function litMasks(frame, digits, threshold = 0.25) {
  let max = 0;
  for (const t of frame.on) if (t > max) max = t;
  const masks = [];
  for (let d = 0; d < digits; d++) {
    let m = 0;
    for (let s = 0; s < 8; s++) if (max > 0 && frame.on[d * 8 + s] > max * threshold) m |= 1 << s;
    masks.push(m);
  }
  return masks;
}
