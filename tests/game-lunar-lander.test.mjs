// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// Independent integer oracle; the game itself uses packed BCD and real panel I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const ROMS = Object.fromEntries(Object.entries({
  pmi80: 'pmi80/pmi80_monitor.bin', pmi80c: 'pmi80/pmi80c_monitor.bin',
  pmi80cgames: 'pmi80/pmi80c_games.bin', savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin',
}).map(([key, file]) => [key, fs.readFileSync(new URL(`roms/${file}`, root))]));
const digits = [0x3f, 6, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 7, 0x7f, 0x6f];
const title = [0x38, 0x3e, 0x54, 0x77, 0x50, 0, 0x38, 0x77, 0x54, 0x5e, 0x79, 0x50];
const dead = [0x5e, 0x79, 0x77, 0x5e];
const safe = [0x6d, 0x77, 0x71, 0x79];
const variants = [['pmi80', 'pmi80', 0x1c00], ['savia84', 'savia', 0x1800], ['stone1', 'stone1', 0x1800]];
const hex = n => n.toString(16).toUpperCase().padStart(4, '0');

function oracle() { return { alt: 450100, vel: -1900, thrust: 2, fuel: 80000, down: 1, mode: 1 }; }
function calculate(s) {
  if (!s.down) return;
  s.vel += s.thrust - 5;
  s.alt += Math.floor(s.vel / 100);
  if (s.alt < 0 || s.alt >= 800000) { s.alt = 0; s.down = 0; s.thrust = 0; return; }
  s.fuel -= s.thrust;
  if (s.fuel < 0) { s.fuel = 0; s.thrust = 0; }
}
function input(s, key) {
  if (key === '=') Object.assign(s, oracle());
  else if (/^[0-9]$/.test(key) && s.thrust) s.thrust = Number(key);
  else if (/^[A-E]$/.test(key)) s.mode = 1;
  else if (key === 'F') s.mode = 0;
}
function bcd(m, addr, count = 3) {
  let n = 0;
  for (let i = count - 1; i >= 0; i--) {
    const b = m.read(addr + i);
    assert.ok((b & 15) < 10 && (b >> 4) < 10, `invalid BCD at ${hex(addr + i)}: ${hex(b)}`);
    n = n * 100 + (b >> 4) * 10 + (b & 15);
  }
  return n;
}
function setBcd(m, addr, value, count = 3) {
  let n = (value + 100 ** count) % (100 ** count);
  for (let i = 0; i < count; i++) {
    const p = n % 100;
    m.write(addr + i, Math.floor(p / 10) * 16 + p % 10);
    n = Math.floor(n / 100);
  }
}
function snapshot(g) {
  const { m, s } = g;
  const vel = bcd(m, s.VEL);
  return { alt: bcd(m, s.ALT), vel: vel >= 800000 ? vel - 1000000 : vel,
    fuel: bcd(m, s.FUEL), thrust: m.read(s.THR), down: m.read(s.DOWN), mode: m.read(s.MODE) };
}
function until(g, predicate, limitMs = 20) {
  const end = g.m.cycles + g.at(limitMs);
  while (!predicate()) {
    assert.ok(g.m.cycles < end, `timeout at PC ${hex(g.m.cpu.pc)}`);
    assert.equal(g.m.cpu.halted, false);
    g.m.cpu.step();
  }
}
function boundary(g) { until(g, () => g.m.cpu.pc === g.s.LOOP); }
function step(g, key) {
  assert.equal(g.m.cpu.pc, g.s.LOOP);
  const before = g.m.cycles;
  g.m.cpu.step();
  if (key) {
    // First refresh observes release of the previous key; the second accepts this key.
    until(g, () => g.m.cpu.pc === g.s.KEY);
    g.m.pressKey(key);
  }
  boundary(g);
  if (key) g.m.releaseKey(key);
  return (g.m.cycles - before) * 1000 / g.profile.clockHz;
}
function shown(g, duration = 20) {
  if (g.s.SLEFT && g.m.read(g.s.SLEFT))
    until(g, () => g.m.read(g.s.SLEFT) === 0 && g.m.read(g.s.SSEQ) === 0, 150);
  g.m.run(g.at(1)); // discard the last digit held by the preceding scan
  g.m.display.takeFrame(g.m.cycles);
  g.m.run(g.at(duration));
  return litMasks(g.m.display.takeFrame(g.m.cycles), 9);
}
function buffers(g) { return Array.from({ length: 9 }, (_, i) => (~g.m.read(g.s.BUFFER + i)) & 0x7f); }
function launch(board, suffix, origin, fw, asm, source) {
  const profile = BOARD_PROFILES[board], m = fw.create(ROMS), s = asm.symbols;
  const g = { profile, m, s, at: ms => Math.round(ms * profile.clockHz / 1000), violations: [], windows: [], newTimes: [], minSP: s.STACK_TOP ?? 0x1fc8 };
  let armed = false;
  const write = m.cpu.bus.write;
  m.cpu.bus.write = (a, v) => {
    if (m.cpu.pc >= origin && m.cpu.pc < s.CODE_END) armed = true;
    if (armed) {
      if (!((a >= s.ALT && a < (s.VAR_END ?? s.TPOS + 1)) || (a >= (s.STACK_BOTTOM ?? 0x1fb0) && a < (s.STACK_TOP ?? 0x1fc8)))) g.violations.push(`write ${hex(a)}`);
      if (a >= (s.STACK_BOTTOM ?? 0x1fb0) && a < (s.STACK_TOP ?? 0x1fc8)) g.minSP = Math.min(g.minSP, a);
      if (a === s.BUFFER + 8 && m.cpu.pc >= s.TCOPY && m.cpu.pc < s.TNEXT)
        g.windows.push({ time: m.cycles, position: m.read(s.TPOS) });
      if (a === s.BUFFER + 8 && m.cpu.pc >= s.TBLANK && m.cpu.pc < s.NEW) g.blankTime = m.cycles;
      if (a === s.ALT && m.cpu.pc >= s.INIT && m.cpu.pc < s.LOOP) g.newTimes.push(m.cycles);
    }
    write(a, v);
  };
  const read = m.cpu.bus.read;
  m.cpu.bus.read = a => {
    if (armed && !(a >= origin && a < s.CODE_END) && !(a >= s.ALT && a < (s.VAR_END ?? s.TPOS + 1)) && !(a >= (s.STACK_BOTTOM ?? 0x1fb0) && a < (s.STACK_TOP ?? 0x1fc8)))
      g.violations.push(`read/execute ${hex(a)}`);
    return read(a);
  };
  const output = m.cpu.bus.output;
  m.cpu.bus.output = (port, value) => {
    if (armed && (port & 255) === 0xf8) {
      if (board !== 'pmi80' && (value & 128)) g.violations.push(`PA7 high: ${hex(value)}`);
      if (board === 'pmi80' && (value & 128) && !(value & 64)) g.violations.push('segment g lit during tone');
    }
    output(port, value);
  };
  const entry = { id: `lunar-lander-${suffix}`, board, format: 'asm', start: hex(origin) };
  startProgram(m, entry, Buffer.from(source), {
    bootStates: g.at(profile.bootMs), holdStates: g.at(fw.holdMs), runKeys: fw.runKeys,
  });
  return g;
}
function check(g) {
  assert.deepEqual(g.violations, []);
  assert.equal(g.m.cpu.halted, false);
  assert.ok(g.minSP >= (g.s.STACK_BOTTOM ?? 0x1fb0));
}
function fresh(g) {
  // The panel restart is handled by the game, never by changing PC or reloading it.
  boundary(g);
  step(g, '=');
  assert.deepEqual(snapshot(g), oracle());
  step(g); // release scan, first physics step
}
function flight(g, actions = new Map()) {
  boundary(g);
  step(g, '=');
  let expected = oracle();
  let n = 0;
  const periods = [];
  while (expected.down && n < 14000) {
    n++;
    const key = actions.get(n);
    periods.push(step(g, key));
    calculate(expected);
    if (key) input(expected, key);
    assert.deepEqual(snapshot(g), expected, `step ${n}`);
  }
  assert.equal(expected.down, 0, 'flight must terminate');
  check(g);
  return { n, expected, periods };
}

for (const [board, suffix, origin] of variants) {
  const source = fs.readFileSync(new URL(`programs/lunar-lander/lunar-lander-${suffix}.asm`, root), 'utf8');
  const asm = assemble(source);
  test(`${board}: assembly fits user RAM and uses documented 8080 instructions`, () => {
    assert.deepEqual(asm.errors, []);
    assert.equal(asm.symbols.START, origin);
    for (const b of asm.blocks) { assert.ok(b.addr >= origin); assert.ok(b.addr + b.bytes.length <= asm.symbols.ALT); }
    assert.ok((asm.symbols.VAR_END ?? asm.symbols.TPOS + 1) <= (asm.symbols.STACK_BOTTOM ?? 0x1fb0));
    if (asm.symbols.SLOT) {
      assert.ok((asm.symbols.BUFFER & 255) + 8 < 256, 'page-local display addressing');
      assert.ok((asm.symbols.ENVELOPES & 255) + 8 < 256, 'page-local envelope addressing');
    }
    assert.match(source.split('\n')[0], /version 0\.1\.1:/);
    assert.match(source, /; Versions:\r?\n; 0\.1\.1  /);
    const image = asm.blocks.flatMap(b => [...b.bytes]);
    assert.equal(origin + image.length, asm.symbols.CODE_END, 'contiguous image ends at CODE_END');
    if (board === 'pmi80') {
      // The permitted omission: not even eight bytes fit before variables and stack.
      assert.equal(asm.symbols.SIGNATURE, asm.symbols.CODE_END);
      assert.equal(asm.symbols.CODE_END, asm.symbols.ALT);
      assert.equal(asm.symbols.VAR_END, asm.symbols.STACK_BOTTOM);
      assert.equal(asm.symbols.STACK_TOP, 0x1fd4);
      assert.equal(asm.symbols.STACK_TOP - origin, 980);
    } else {
      assert.equal(asm.symbols.SIGNATURE, asm.symbols.CODE_END - 12);
      assert.deepEqual(image.slice(-12), [...Buffer.from('Wolf2026v011', 'ascii')],
        'versioned signature is the last code/data in the image');
    }
    const manual = [...source.matchAll(/^; ([0-9A-F]{4}): ((?:[0-9A-F]{2} ?)+)$/gm)];
    if (manual.length) {
      const bytes = manual.flatMap(row => row[2].trim().split(' ').map(b => parseInt(b, 16)));
      assert.deepEqual(bytes, asm.blocks.flatMap(b => [...b.bytes]), 'manual-entry bytes match assembly');
      let address = origin;
      for (const row of manual) { assert.equal(parseInt(row[1], 16), address); address += row[2].trim().split(' ').length; }
    }
    assert.doesNotMatch(source, /\b(?:JPE|JPO|CPE|CPO|RPE|RPO)\b/);
    console.log(`${board}: ${asm.symbols.CODE_END - origin} assembled bytes; end ${hex(asm.symbols.CODE_END - 1)}`);
    if (process.env.LANDER_LISTING) {
      const lines = [];
      for (const block of asm.blocks) for (let i = 0; i < block.bytes.length; i += 16)
        lines.push('; ' + hex(block.addr + i) + ': ' + [...block.bytes.slice(i, i + 16)].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
      console.log('MANUAL ' + suffix + ' ' + JSON.stringify(lines));
    }
  });
  for (const fw of BOARD_PROFILES[board].firmware) {
    test(`${board}/${fw.id}: title, complete flights, panel controls and memory safety`, () => {
      const g = launch(board, suffix, origin, fw, asm, source);
      assert.deepEqual(shown(g).slice(2), title.slice(0, 7));
      assert.deepEqual(buffers(g).slice(0, 2), [0, 0]);
      // Observe every scroll window from actual refreshes, including the last and the blank.
      for (let pos = 1; pos <= 5; pos++) {
        until(g, () => g.m.read(g.s.TPOS) === pos, 1700);
        until(g, () => g.m.cpu.pc === g.s.TWAIT);
        assert.deepEqual(shown(g).slice(2), title.slice(pos, pos + 7));
      }
      until(g, () => g.m.read(g.s.TPOS) === 6, 1200);
      until(g, () => g.m.cpu.pc === g.s.WAIT);
      assert.deepEqual(shown(g), Array(9).fill(0));
      until(g, () => g.m.cpu.pc === g.s.LOOP, 600);
      assert.deepEqual(snapshot(g), oracle(), 'automatic initial flight');
      assert.equal(g.windows.length, 6);
      const durations = g.windows.slice(1).map((w, i) => (w.time - g.windows[i].time) * 1000 / g.profile.clockHz);
      console.log(`${board}/${fw.id}: title windows ms ${durations.map(x => x.toFixed(3)).join(', ')}`);
      const titleTimes = [...durations, (g.blankTime - g.windows[5].time) * 1000 / g.profile.clockHz, (g.newTimes[0] - g.blankTime) * 1000 / g.profile.clockHz];
      console.log(`${board}/${fw.id}: full title timings ms ${titleTimes.map(x => x.toFixed(3)).join(', ')}`);
      const targets = [1500, 250, 250, 250, 250, 1000, 400];
      titleTimes.forEach((t, i) => assert.ok(Math.abs(t - targets[i]) < 4, `title duration ${i}: ${t} ms`));
      const crash = flight(g);
      assert.equal(crash.n, 4866);
      assert.deepEqual(shown(g).slice(2, 6), dead);
      assert.deepEqual(buffers(g).slice(7), [digits[6], digits[5]]);
      assert.equal(buffers(g)[0], digits[0]);
      assert.equal(buffers(g)[1], 0);
      assert.equal(buffers(g)[6], 0);
      console.log(`${board}/${fw.id}: step ms min=${Math.min(...crash.periods).toFixed(4)}, max=${Math.max(...crash.periods).toFixed(4)}, mean=${(crash.periods.reduce((a,b) => a+b, 0) / crash.periods.length).toFixed(4)}`);
      const normalPeriods = crash.periods.slice(0, -1); // the final contact has a shorter terminal branch
      assert.ok(Math.abs(normalPeriods.reduce((a,b) => a+b, 0) / normalPeriods.length - 9.1) < 0.005);
      assert.ok(normalPeriods.every(t => Math.abs(t - 9.1) < 0.01));
      const land = flight(g, new Map([[1, '1'], [1751, '5'], [4024, '9'], [5800, '5'], [8139, '9'], [8514, '5']]));
      assert.equal(land.n, 11176);
      assert.deepEqual(shown(g).slice(2, 6), safe);
      assert.deepEqual(buffers(g).slice(7), [digits[0], digits[3]]);
      boundary(g);
      step(g, 'F'); step(g);
      assert.deepEqual(shown(g).slice(2, 6), [0x71, digits[2], digits[2], digits[5]]);
      for (const key of ['A', 'B', 'C', 'D', 'E']) {
        boundary(g); step(g, 'F'); step(g); step(g, key); step(g);
        assert.deepEqual(buffers(g).slice(2, 6), safe);
      }
      for (const key of ['EX', 'R', 'M', 'L', 'S', 'BR', '9']) {
        boundary(g); const before = snapshot(g); step(g, key); step(g);
        assert.deepEqual(snapshot(g), before, `ignored key ${key}`);
      }
      fresh(g);
      assert.deepEqual(snapshot(g), { ...oracle(), alt: 450080, vel: -1903, fuel: 79998 });
      assert.deepEqual(buffers(g), [digits[2], 0, digits[4], digits[5], digits[0], digits[0], 0, digits[2], digits[0]]);
      // Engine shutdown is permanent; ceiling and ascent use the same integer oracle.
      const off = flight(g, new Map([[1, '0'], [20, '9']]));
      assert.equal(off.n, 3871);
      console.log(`${board}/${fw.id}: coast step mean ${(off.periods.slice(2, -1).reduce((a,b) => a+b, 0) / (off.periods.length - 3)).toFixed(4)} ms`);
      assert.deepEqual(shown(g).slice(2, 6), dead);
      const ceiling = flight(g, new Map([[1, '9']]));
      assert.equal(ceiling.n, 4700);
      assert.deepEqual(shown(g).slice(2, 6), dead);
      assert.deepEqual(buffers(g).slice(7), [digits[6], digits[8]]);
      fresh(g);
      // Isolate the original's >=100 ascent bug before the ceiling can hide it.
      setBcd(g.m, g.s.VEL, 12345);
      setBcd(g.m, g.s.ALT, 450100);
      g.m.write(g.s.THR, 5); g.m.write(g.s.ACC, 0); g.m.write(g.s.ASIGN, 0);
      step(g);
      assert.equal(bcd(g.m, g.s.ALT), 450223);
      assert.deepEqual(buffers(g).slice(7), [digits[2], digits[3]]);
      setBcd(g.m, g.s.ALT, 799999);
      step(g);
      assert.equal(g.m.read(g.s.DOWN), 0);
      assert.deepEqual(buffers(g).slice(2, 6), dead);
      fresh(g);
      // The floor of velocity makes -5.00 safe and -5.01 fatal.
      for (const [velocity, message] of [[-500, safe], [-501, dead], [-1, safe]]) {
        fresh(g);
        setBcd(g.m, g.s.ALT, 0); setBcd(g.m, g.s.VEL, velocity);
        g.m.write(g.s.THR, 5); g.m.write(g.s.ACC, 0); g.m.write(g.s.ASIGN, 0);
        step(g);
        assert.equal(g.m.read(g.s.DOWN), 0);
        assert.deepEqual(buffers(g).slice(2, 6), message);
      }
      fresh(g);
      // Exhaustion happens strictly on a borrow, not when fuel becomes exactly zero.
      step(g, '9');
      setBcd(g.m, g.s.FUEL, 9);
      step(g);
      assert.equal(bcd(g.m, g.s.FUEL), 0);
      assert.equal(g.m.read(g.s.THR), 9);
      step(g);
      assert.equal(g.m.read(g.s.THR), 0);
      assert.equal(bcd(g.m, g.s.ACC, 2), 9995);
      const exhaustedVelocity = snapshot(g).vel;
      step(g, '9');
      assert.equal(g.m.read(g.s.THR), 0);
      assert.equal(snapshot(g).vel, exhaustedVelocity - 5);
      fresh(g);
      // Switching directly between held keys must not bypass full-release gating.
      const altitudeMs = step(g);
      g.m.pressKey('F'); step(g); const fuelMs = step(g);
      console.log(`${board}/${fw.id}: altitude ${altitudeMs.toFixed(4)} / fuel held ${fuelMs.toFixed(4)} ms`);
      assert.equal(g.m.read(g.s.MODE), 0);
      assert.equal(buffers(g)[2], 0x71);
      g.m.releaseKey('F'); step(g);
      const fuelIdleMs = step(g);
      assert.ok(Math.abs(fuelIdleMs - 9.1) < 0.01);
      console.log(`${board}/${fw.id}: fuel idle ${fuelIdleMs.toFixed(4)} ms`);
      g.m.pressKey('F'); step(g);
      g.m.releaseKey('F'); g.m.pressKey('A'); step(g);
      assert.equal(g.m.read(g.s.MODE), 0);
      g.m.releaseKey('A'); step(g);
      step(g, 'A'); step(g);
      assert.equal(g.m.read(g.s.MODE), 1);
      g.m.pressKey('='); step(g);
      assert.deepEqual(snapshot(g), oracle());
      step(g); step(g);
      assert.equal(snapshot(g).vel, -1906, 'held = must not restart repeatedly');
      g.m.releaseKey('='); step(g);
      check(g);
      console.log(`${board}/${fw.id}: deepest stack address ${hex(g.minSP)}; all reference flights agree`);
    });
    test(`${board}/${fw.id}: a fresh key skips the title without changing initial thrust`, () => {
      const g = launch(board, suffix, origin, fw, asm, source);
      assert.equal(g.windows.length, 1, 'held monitor start key did not skip the title');
      g.m.pressKey('7');
      until(g, () => g.m.cpu.pc === g.s.LOOP);
      assert.deepEqual(snapshot(g), oracle());
      step(g);
      assert.equal(g.m.read(g.s.THR), 2, 'skip key is still held, not a thrust command');
      g.m.releaseKey('7'); step(g);
      step(g, '7');
      assert.equal(g.m.read(g.s.THR), 7);
      check(g);
    });
  }
}

// Exercise real sound events, not a direct jump into the tone routine.
for (const fw of BOARD_PROFILES.pmi80.firmware) {
  test(`pmi80/${fw.id}: H, HH and L keep multiplex and the 9.1 ms simulation running`, () => {
    const source = fs.readFileSync(new URL('programs/lunar-lander/lunar-lander-pmi80.asm', root), 'utf8');
    const asm = assemble(source);
    assert.deepEqual(asm.errors, []);
    const g = launch('pmi80', 'pmi80', 0x1c00, fw, asm, source);
    g.m.pressKey('7'); until(g, () => g.m.cpu.pc === g.s.LOOP);
    g.m.releaseKey('7'); step(g);
    for (const kind of ['H', 'HH', 'L']) {
      fresh(g);
      g.m.write(g.s.ASIGN, 0);
      if (kind === 'H') {
        g.m.write(g.s.THR, 9); g.m.write(g.s.ACC, 4);
        setBcd(g.m, g.s.FUEL, 0);
      } else {
        g.m.write(g.s.THR, 5); g.m.write(g.s.ACC, 0);
        setBcd(g.m, g.s.ALT, 0);
        setBcd(g.m, g.s.VEL, kind === 'HH' ? -300 : -600);
      }
      const writes = [];
      const output = g.m.cpu.bus.output;
      g.m.cpu.bus.output = (port, value) => {
        if ((port & 255) === 0xf8) writes.push({ time: g.m.cycles, value, column: g.m.cpu.c });
        output(port, value);
      };
      g.m.takeAudio();
      const expected = snapshot(g), periods = [];
      for (let n = 0; n < 18; n++) {
        periods.push(step(g));
        calculate(expected);
        assert.deepEqual(snapshot(g), expected, `${kind}: physics continues during sound, step ${n}`);
      }
      g.m.cpu.bus.output = output;
      const audio = g.m.takeAudio();
      const bursts = [];
      for (const time of audio.edges) {
        if (!bursts.length || time - bursts.at(-1).at(-1) > g.at(5)) bursts.push([]);
        bursts.at(-1).push(time);
      }
      assert.equal(bursts.length, kind === 'HH' ? 2 : 1, `${kind}: correct burst count, no repeat`);
      const measurements = bursts.map(edges => {
        const half = (edges.at(-1) - edges[0]) / (edges.length - 1);
        const hz = g.profile.clockHz / (2 * half);
        const duration = (edges.at(-1) - edges[0] + half) * 1000 / g.profile.clockHz;
        const target = kind === 'L' ? 500 : 1000;
        assert.ok(Math.abs(hz - target) < target * 0.03, `${kind}: ${hz} Hz`);
        assert.ok(Math.abs(duration - 30) < 1, `${kind}: ${duration} ms`);
        // Interleaved 8080 work causes bounded jitter; there are no full-frame tone gaps.
        const fullPeriods = edges.slice(2).map((t, i) => (t - edges[i]) * 1000 / g.profile.clockHz);
        assert.ok(fullPeriods.every(t => Math.abs(t - 1000 / target) < (kind === 'L' ? 0.4 : kind === 'HH' ? 0.35 : 0.25)), `${kind}: period outlier ${fullPeriods}`);
        const active = writes.filter(w => w.time >= edges[0] && w.time <= edges.at(-1));
        assert.ok(active.every(w => w.value & 0x40), `${kind}: segment g must be off, in both tone phases`);
        assert.equal(new Set(active.map(w => w.column)).size, 9, `${kind}: all digits continue scanning`);
        assert.ok(active.some(w => ((~w.value) & 0x3f) !== 0), `${kind}: other segments remain lit`);
        return { hz, duration, half, minPeriod: Math.min(...fullPeriods), maxPeriod: Math.max(...fullPeriods) };
      });
      if (kind === 'HH') {
        const gapStart = bursts[0].at(-1) + measurements[0].half;
        const gap = (bursts[1][0] - gapStart) * 1000 / g.profile.clockHz;
        assert.ok(Math.abs(gap - 40) < 1, `HH gap: ${gap} ms`);
        console.log(`pmi80/${fw.id}: HH gap ${gap.toFixed(3)} ms`);
        const quiet = writes.filter(w => w.time > gapStart && w.time < bursts[1][0]);
        assert.ok(quiet.every(w => !(w.value & 0x80)), 'HH gap has PA7 low');
        assert.ok(quiet.some(w => !(w.value & 0x40)), 'segment g is restored during the HH gap');
      }
      assert.equal(g.m.read(g.s.SLEFT), 0);
      assert.equal(g.m.read(g.s.SSEQ), 0);
      assert.equal(g.m.ppi.outputA() & 0x80, 0, 'PA7 returns low');
      assert.equal(g.m.k3.level, 1, 'K3 returns to its silent high level');
      const quiet = periods.slice(-4).reduce((a, b) => a + b, 0) / 4;
      const during = periods.slice(1, kind === 'HH' ? 11 : 4);
      assert.ok(Math.abs(quiet - 9.1) < 0.025, `${kind}: silent step ${quiet} ms`);
      assert.ok(during.every(t => Math.abs(t - quiet) < 0.01), `${kind}: beep changes step time: ${during}, quiet ${quiet}`);
      if (kind === 'H') assert.ok(Math.abs(periods[0] - 9.1) < 0.011, 'fuel exhaustion event also keeps its time budget');
      console.log(`pmi80/${fw.id}: ${kind} ${measurements.map(v => `${v.hz.toFixed(2)} Hz/${v.duration.toFixed(3)} ms [period ${v.minPeriod.toFixed(3)}..${v.maxPeriod.toFixed(3)} ms]`).join(', ')}, step ${quiet.toFixed(4)} ms, beep delta ${Math.max(...during.map(t => Math.abs(t - quiet))).toFixed(4)} ms`);
      check(g);
    }
  });
}