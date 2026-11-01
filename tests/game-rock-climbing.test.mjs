// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Independent game tests: no catalogue entry or generated files are needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const romFiles = {
  pmi80: 'pmi80/pmi80_monitor.bin', pmi80c: 'pmi80/pmi80c_monitor.bin',
  pmi80cgames: 'pmi80/pmi80c_games.bin', savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin',
};
const roms = Object.fromEntries(Object.entries(romFiles).map(([id, file]) =>
  [id, fs.readFileSync(new URL(`roms/${file}`, root))]));
const title = [0x50, 0x3f, 0x39, 0x76, 0, 0x39, 0x38, 0x30, 0x37, 0x37, 0x7c, 0x30, 0x54, 0x3d];
const digits = [0x3f, 6, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 7, 0x7f, 0x6f];

function compiled(board) {
  const suffix = board === 'savia84' ? 'savia' : board;
  const data = fs.readFileSync(new URL(`programs/rock-climbing/rock-climbing-${suffix}.asm`, root));
  const asm = assemble(data.toString('utf8'));
  assert.deepEqual(asm.errors, []);
  const s = asm.symbols;
  assert.equal(s.START, board === 'pmi80' ? 0x1c00 : 0x1800);
  assert.ok(s.END_RAM <= 0x1fa0, `program overlaps its stack: ${s.END_RAM.toString(16)}`);
  assert.equal(asm.blocks[0].addr, s.START);
  for (const b of asm.blocks) {
    assert.ok(b.addr >= s.START && b.addr + b.bytes.length <= s.END_RAM);
  }
  const version = data.toString('utf8').match(/^; Rock Climbing .* version (\d\.\d\.\d):/m)?.[1];
  assert.equal(version, '0.1.1', 'source header version');
  assert.match(data.toString('utf8'), /^; 0\.1\.1  /m, 'version history entry');
  const signature = Buffer.from(`Wolf2026v${version.replaceAll('.', '')}`, 'ascii');
  const lastBlock = asm.blocks.at(-1);
  assert.deepEqual(Buffer.from(lastBlock.bytes.slice(-signature.length)), signature,
    'the image ends with the author and matching version signature');
  assert.equal(lastBlock.addr + lastBlock.bytes.length, s.STATE,
    'no emitted bytes follow the signature; DS variables begin here');
  assert.equal(s.SIGNATURE, s.STATE - signature.length);
  return { data, asm, s };
}

function setup(board, fw) {
  const { data, asm, s } = compiled(board);
  const profile = BOARD_PROFILES[board];
  const m = fw.create(roms);
  const at = ms => Math.round(ms * profile.clockHz / 1000);
  const faults = [], windows = [], falls = [], dieFaces = [], tones = [], paWrites = [];
  let sounding = null;
  let entered = false, previousWindow = '', minSp = s.STACK_TOP;
  const read = m.cpu.bus.read, write = m.cpu.bus.write, output = m.cpu.bus.output;
  m.cpu.bus.read = a => {
    if (a === s.START) entered = true;
    if (entered && !((a >= s.START && a < s.END_RAM) || (a >= 0x1fa0 && a < s.STACK_TOP))) {
      faults.push(`read outside the program and stack: ${a.toString(16)}`);
    }
    if (entered && a === s.FRAME) {
      minSp = Math.min(minSp, m.cpu.sp);
      const values = Array.from({ length: 9 }, (_, i) => m.read(s.BUFFER + i));
      const signature = values.join(',');
      if (signature !== previousWindow) {
        windows.push({ ms: m.cycles / profile.clockHz * 1000, values });
        previousWindow = signature;
      }
    }
    if (entered && a === s.FALL) falls.push(m.cycles);
    if (entered && a === s.TONE) {
      m.takeAudio();
      sounding = { from: m.cycles, halves: m.cpu.b, dwell: m.cpu.a, columns: new Set() };
    }
    if (entered && a === s.TONE_DONE) {
      tones.push({ ...sounding, to: m.cycles, audio: m.takeAudio() });
      sounding = null;
    }
    return read(a);
  };
  m.cpu.bus.write = (a, v) => {
    if (entered) {
      if (a >= 0x1fa0 && a < s.STACK_TOP) minSp = Math.min(minSp, a);
      if (!((a >= s.STATE && a < s.END_RAM) || (a >= 0x1fa0 && a < s.STACK_TOP))) {
        faults.push(`write ${a.toString(16)} at PC ${m.cpu.pc.toString(16)}`);
      }
      if (a === s.LAST_DIE && v < 6) dieFaces.push(v + 1);
    }
    write(a, v);
  };
  m.cpu.bus.output = (p, v) => {
    if (entered && (p & 0xff) === 0xf8) {
      if ((v & 0x80) && (board !== 'pmi80' || !sounding)) faults.push('PA7 set outside a PMI-80 tone');
      if (sounding && !(v & 0x40)) faults.push('segment g lit during a tone');
      paWrites.push({ time: m.cycles, value: v, sounding: Boolean(sounding) });
    }
    output(p, v);
    if (sounding && (p & 0xff) === 0xfa) {
      const column = m.selectedColumn();
      if (column < 9) sounding.columns.add(column);
    }
  };
  const entry = { id: 'rock-climbing', board, format: 'asm', start: s.START.toString(16).toUpperCase() };
  startProgram(m, entry, data, {
    bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys,
  });
  assert.equal(entered, true, 'monitor did not enter the program');
  function run(ms) { m.run(at(ms)); }
  function until(label, timeout = 6000) {
    const address = s[label], limit = m.cycles + at(timeout);
    assert.ok(address !== undefined, label);
    while (m.cpu.pc !== address && m.cycles < limit && !m.cpu.halted) m.cpu.step();
    assert.equal(m.cpu.pc, address, `did not reach ${label}`);
  }
  function press(key, hold = 30) {
    m.pressKey(key); run(hold); m.releaseKey(key); run(30);
  }
  function shown(ms = 20) {
    m.display.takeFrame(m.cycles); run(ms);
    return litMasks(m.display.takeFrame(m.cycles), profile.digits);
  }
  function check() {
    assert.deepEqual(faults, []);
    assert.equal(m.cpu.halted, false);
    assert.ok(m.cpu.pc >= s.START && m.cpu.pc < s.STATE, 'CPU left the game');
    assert.ok(minSp >= 0x1fa0, `stack overflow: ${minSp.toString(16)}`);
  }
  return { m, s, asm, at, run, until, press, shown, check, windows, falls, dieFaces, profile, tones, paWrites,
    minimumStack: () => minSp };
}

function lfsr(state) { return ((state << 1) ^ (state & 0x8000 ? 0x2d : 0)) & 0xffff; }
function nextFace(state, previous) {
  for (;;) {
    for (let i = 0; i < 4; i++) state = lfsr(state);
    const raw = ((state >> 8) ^ state) & 7;
    if (raw < 6 && raw !== previous) return { state, raw, face: raw + 1 };
  }
}
function seedFor(faces, previous = 0xff) {
  for (let seed = 1; seed <= 0xffff; seed++) {
    let state = seed, last = previous;
    if (faces.every(face => {
      const r = nextFace(state, last); state = r.state; last = r.raw;
      return face === r.face;
    })) return seed;
  }
  assert.fail(`no seed for ${faces}`);
}
function climb(g, faces, destination = 'TURN', previous = 0xff) {
  g.press('L');
  assert.equal(g.m.read(g.s.CHOICE), 1);
  g.m.pressKey('=');
  g.until('DIE', 200);
  const seed = seedFor(faces, previous);
  g.m.write(g.s.RNG, seed & 0xff); g.m.write(g.s.RNG + 1, seed >> 8);
  g.m.write(g.s.LAST_DIE, previous);
  const first = g.dieFaces.length;
  g.until(destination, 200);
  assert.deepEqual(g.dieFaces.slice(first), faces);
  g.m.releaseKey('=');
}
function bufferNumber(g, player) {
  const address = player ? g.s.P2_DIGITS : g.s.P1_DIGITS;
  return Array.from({ length: 3 }, (_, i) => digits.indexOf(g.m.read(address + i))).join('');
}
function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(3)} ms, expected ${expected}`);
}

for (const board of ['pmi80', 'savia84', 'stone1']) {
  for (const fw of BOARD_PROFILES[board].firmware) {
    const name = `${board}/${fw.id}`;
    test(`${name}: assembles, starts from the monitor, scrolls the title and debounces startup`, t => {
      const g = setup(board, fw);
      assert.deepEqual(g.shown(), [0, 0, ...title.slice(0, 7)]);
      // The monitor's launch key may still be held while the program starts.
      g.m.pressKey('=');
      g.until('MAIN'); g.run(150);
      assert.equal(g.m.read(g.s.CHOICE), 0);
      g.m.releaseKey('='); g.run(25);
      const titleWindows = g.windows.slice(0, 9);
      assert.equal(titleWindows.length, 9);
      for (let i = 0; i < 8; i++) {
        assert.deepEqual(titleWindows[i].values, [0, 0, ...title.slice(i, i + 7)]);
      }
      assert.deepEqual(titleWindows[8].values, Array(9).fill(0));
      const intervals = titleWindows.slice(1).map((v, i) => v.ms - titleWindows[i].ms);
      near(intervals[0], 1500, 40, 'first window');
      for (const dt of intervals.slice(1, 7)) near(dt, 250, 12, 'scroll step');
      near(intervals[7], 1000, 30, 'last window');
      near(g.windows[9].ms - titleWindows[8].ms, 400, 18, 'blank pause');
      // The active player's three digits blink; the other player stays visible.
      const firstTurn = g.windows[9];
      const blinkAt = g.windows[10];
      near(blinkAt.ms - firstTurn.ms, 100, 6, 'active-player blink');
      const activeDigits = board === 'savia84' ? [2, 3, 4] : [1, 2, 3];
      assert.deepEqual(activeDigits.map(i => firstTurn.values[i]), [0x3f, 0x3f, 0x3f]);
      assert.deepEqual(activeDigits.map(i => blinkAt.values[i]), [0, 0, 0]);
      assert.equal(g.m.read(g.s.CHOICE), 0, 'launch key must not select a move');
      g.press('=');
      assert.equal(g.m.read(g.s.CHOICE), 0, 'confirm before a choice is ignored');
      g.press('8');
      assert.equal(g.m.read(g.s.CHOICE), 0, 'unrelated keys are ignored');
      g.m.pressKey('L'); g.run(25);
      assert.equal(g.m.read(g.s.CHOICE), 1);
      g.m.pressKey('S'); g.run(25); g.m.releaseKey('L'); g.run(25);
      assert.equal(g.m.read(g.s.CHOICE), 1, 'changing held keys needs a release');
      g.m.releaseKey('S'); g.run(25); g.press('S');
      assert.equal(g.m.read(g.s.CHOICE), 8);
      const display = g.shown();
      assert.equal(display[board === 'savia84' ? 1 : 8], 0, 'unused position stays dark');
      assert.equal(display[0], 8);
      assert.equal(bufferNumber(g, 0), '000');
      assert.equal(bufferNumber(g, 1), '000');
      t.diagnostic(`assembled ${g.s.END_RAM - g.s.START} bytes; title intervals ${intervals.map(x => x.toFixed(2)).join(', ')} ms`);
      g.check();
    });

    test(`${name}: climbing, securing, falling, winning and automatic restart`, t => {
      const g = setup(board, fw);
      g.until('MAIN'); g.run(25);
      climb(g, [2, 5]); g.run(25);
      assert.equal(g.m.read(g.s.HEIGHTS), 7);
      assert.equal(g.m.read(g.s.ACTIVE), 0, 'successful climb retains the turn');
      g.press('S');
      assert.equal(bufferNumber(g, 0), '007');
      assert.equal(g.m.read(g.s.P1_MARK), 8);
      g.press('=');
      assert.equal(g.m.read(g.s.SAFE), 7);
      assert.equal(g.m.read(g.s.ACTIVE), 1);
      g.press('S'); g.press('=');
      assert.equal(g.m.read(g.s.ACTIVE), 0, 'rest without climbing is allowed');
      climb(g, [3, 4]); g.run(25);
      assert.equal(g.m.read(g.s.HEIGHTS), 14);
      climb(g, [1], 'FALL');
      const fallAt = g.m.cycles;
      g.run(450);
      assert.equal(g.m.read(g.s.HEIGHTS), 7);
      assert.equal(g.m.read(g.s.ACTIVE), 0, 'fall pause must retain the old turn');
      assert.equal(bufferNumber(g, 0), '007');
      assert.equal(g.m.read(g.s.P1_MARK), 1, 'climbing marker remains during the fall');
      g.until('SWITCH', 100);
      const fallMs = (g.m.cycles - fallAt) / g.profile.clockHz * 1000;
      near(fallMs, 500, 18, 'fall pause');
      g.run(25);
      assert.equal(g.m.read(g.s.ACTIVE), 1);
      // A one on the second die also falls, and no further die is rolled.
      g.m.write(g.s.HEIGHTS + 1, 20); g.m.write(g.s.SAFE + 1, 9);
      climb(g, [4, 1], 'FALL'); g.run(550);
      assert.equal(g.m.read(g.s.HEIGHTS + 1), 9);
      assert.equal(g.m.read(g.s.ACTIVE), 0);
      g.m.write(g.s.HEIGHTS, 97);
      climb(g, [4, 6], 'WIN');
      const winAt = g.m.cycles;
      g.run(board === 'pmi80' ? 240 : 140);
      assert.equal(g.m.read(g.s.HEIGHTS), 107);
      assert.equal(bufferNumber(g, 0), '107', 'original missing hundreds bug is fixed');
      const winner = g.shown();
      const p = board === 'savia84' ? [2, 3, 4] : [1, 2, 3];
      assert.deepEqual(p.map(i => winner[i]), [digits[1], digits[0], digits[7]]);
      g.until('NEW_GAME', 4500);
      const winMs = (g.m.cycles - winAt) / g.profile.clockHz * 1000;
      near(winMs, board === 'pmi80' ? 4100 : 4000, 120, 'win sound, animation and steady pause');
      const winWindows = g.windows.filter(w => w.ms >= winAt / g.profile.clockHz * 1000).slice(-20);
      assert.equal(winWindows.length, 20, 'ten whole-display off/on cycles');
      for (let i = 0; i < winWindows.length; i++) {
        assert.equal(winWindows[i].values.every(v => v === 0), i % 2 === 0);
        if (i) near(winWindows[i].ms - winWindows[i - 1].ms, 100, 6, 'win half-period');
      }
      near(g.m.cycles / g.profile.clockHz * 1000 - winWindows.at(-1).ms, 2100, 55, 'last on phase plus steady pause');
      g.run(50);
      assert.deepEqual(Array.from({ length: 5 }, (_, i) => g.m.read(g.s.HEIGHTS + i)), [0, 0, 0, 0, 0]);
      assert.equal(g.m.read(g.s.TITLE_OFFSET), 8, 'restart does not replay the title');
      // Exact 100 and the highest possible nonrepeating two-die result at 99.
      for (const [player, height, faces, result] of [[0, 90, [4, 6], 100], [1, 99, [5, 6], 110]]) {
        g.m.write(g.s.ACTIVE, player);
        g.m.write(g.s.HEIGHTS + player, height);
        climb(g, faces, 'WIN'); g.run(board === 'pmi80' ? 240 : 140);
        assert.equal(g.m.read(g.s.HEIGHTS + player), result);
        assert.equal(bufferNumber(g, player), String(result));
        g.until('NEW_GAME', 4500); g.run(30);
      }
      t.diagnostic(`fall ${fallMs.toFixed(2)} ms; win ${winMs.toFixed(2)} ms; lowest stack write ${g.minimumStack().toString(16)}`);
      g.check();
    });

    test(`${name}: nonrepeating dice, held confirmation, debounce and key-time entropy`, () => {
      const g = setup(board, fw);
      g.until('MAIN'); g.run(25);
      g.press('L');
      g.m.pressKey('='); g.until('DIE', 200);
      const seed = seedFor([2, 5]);
      const firstRaw = (((lfsr(lfsr(lfsr(lfsr(seed))))) >> 8) ^ lfsr(lfsr(lfsr(lfsr(seed))))) & 7;
      assert.equal(firstRaw, 1);
      // The first candidate equals the preceding die: the real generator must reject it.
      g.m.write(g.s.RNG, seed & 0xff); g.m.write(g.s.RNG + 1, seed >> 8);
      g.m.write(g.s.LAST_DIE, firstRaw);
      const expectedFirst = nextFace(seed, firstRaw);
      const expectedSecond = nextFace(expectedFirst.state, expectedFirst.raw);
      const expected = expectedFirst.face === 1 ? [1] : [expectedFirst.face, expectedSecond.face];
      const start = g.dieFaces.length;
      g.until(expected.includes(1) ? 'FALL' : 'TURN', 200);
      assert.deepEqual(g.dieFaces.slice(start), expected);
      assert.notEqual(expected[0], firstRaw + 1);
      g.run(750);
      assert.equal(g.dieFaces.length, start + expected.length, 'held confirm cannot trigger another throw');
      g.m.releaseKey('='); g.run(25);
      // A press lasting only one complete frame must not select a move.
      g.until('FRAME');
      g.m.pressKey('S'); g.m.cpu.step(); g.until('FRAME', 30);
      g.m.releaseKey('S'); g.run(25);
      assert.equal(g.m.read(g.s.CHOICE), 0);
      // A waiting frame changes the state; normal key timing therefore changes the seed.
      const readState = () => g.m.read(g.s.RNG) | (g.m.read(g.s.RNG + 1) << 8);
      g.until('FRAME'); const before = readState();
      g.m.cpu.step(); g.until('FRAME', 30); const after = readState();
      assert.notEqual(after, before);
      assert.notEqual(after, 0);
      g.check();
    });

    if (board === 'pmi80') test(`${name}: C, L and HH sound on K3 with live multiplex and no segment g`, t => {
      const g = setup(board, fw);
      g.until('MAIN'); g.run(25);
      climb(g, [2, 5]); g.run(25);
      assert.equal(g.tones.length, 1, 'successful climb makes one click');
      climb(g, [1], 'FALL');
      const fallAt = g.m.cycles;
      g.until('SWITCH', 600);
      near((g.m.cycles - fallAt) / g.profile.clockHz * 1000, 500, 5, 'tone is included in the fall pause');
      assert.equal(g.tones.length, 2);
      near((g.tones[1].from - fallAt) / g.profile.clockHz * 1000, 0, 2, 'low tone starts at the fall');
      g.run(25);
      g.m.write(g.s.HEIGHTS + 1, 96);
      climb(g, [4, 6], 'WIN');
      g.until('WIN_LOOP', 200);
      assert.equal(g.tones.length, 4, 'win makes HH without an extra climb click');
      const expected = [[20, 23, 10, 0.5], [30, 60, 30, 1], [60, 23, 30, 0.5], [60, 23, 30, 0.5]];
      for (const [i, tone] of g.tones.entries()) {
        const [halves, dwell, duration, halfPeriod] = expected[i];
        assert.equal(tone.halves, halves);
        assert.equal(tone.dwell, dwell);
        assert.equal(tone.audio.edges.length, halves, 'actual K3 transitions');
        near((tone.to - tone.from) / g.profile.clockHz * 1000, duration, 0.4, 'tone duration');
        // The last edge turns sound off; the intervening edges must be periodic.
        for (let j = 1; j < tone.audio.edges.length - 1; j++) {
          near((tone.audio.edges[j] - tone.audio.edges[j - 1]) / g.profile.clockHz * 1000,
            halfPeriod, 0.005, 'K3 half-period');
        }
        assert.deepEqual([...tone.columns].sort(), [0, 1, 2, 3, 4, 5, 6, 7, 8], 'all nine digits scan during sound');
        const lastWrite = g.paWrites.filter(w => w.time < tone.to).at(-1);
        assert.equal(lastWrite.value & 0x80, 0, 'PA7 low on return');
      }
      const gapStart = g.tones[2].to, gapEnd = g.tones[3].from;
      near((gapEnd - gapStart) / g.profile.clockHz * 1000, 40, 1, 'HH gap');
      const gapWrites = g.paWrites.filter(w => w.time >= gapStart && w.time < gapEnd);
      assert.ok(gapWrites.length >= 9 * 2);
      assert.ok(gapWrites.every(w => !w.sounding && !(w.value & 0x80)), 'normal silent scan in the gap');
      assert.ok(gapWrites.some(w => !(w.value & 0x40)), 'segment g restored normally in the gap');
      t.diagnostic(`K3 tone lengths: ${g.tones.map(x => ((x.to - x.from) / g.profile.clockHz * 1000).toFixed(3)).join(', ')} ms`);
      g.check();
    });
  }
}
