// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// The programs in extras/: AION Buzzer 80 in an EPROM sounds as its RAM edition; the clock in an
// EPROM asks for the time and the correction and keeps corrected seconds; the PMI-80 clocks keep exact seconds on their own monitor and roll
// over into minutes, hours and a new day; the calibrated ones lengthen their seconds by the
// correction.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { Pmi80, pmi80RunKeys } from '../src/board/pmi80.js';
import { litMasks } from '../src/machine/display.js';
import { parseIntelHex } from '../src/machine/memfile.js';
import { epromBlocks, epromImage } from '../tools/make-listings.mjs';

const root = new URL('../', import.meta.url);
const rom = name => fs.readFileSync(new URL(`roms/pmi80/${name}`, root));
const SECOND = 1111111; // 10 MHz / 9, rounded down
const at = ms => Math.round(ms * SECOND / 1000);
const DIGITS = { 0x3f: '0', 0x06: '1', 0x5b: '2', 0x4f: '3', 0x66: '4', 0x6d: '5', 0x7d: '6', 0x07: '7', 0x7f: '8', 0x6f: '9', 0x40: '-', 0: ' ' };

// Types the clock and the time into the board (with the calibrated clocks, the correction into the
// program as BCD, if given, and a fraction that is not BCD, which the clock clears), starts it
// with EX 1C00 =, and returns the lengths of the seconds (from one pass of LOOP to the
// next) over `seconds`, the fraction (as a number) at each pass, the time and the display.
function runClock({ create, holdMs }, file, time, seconds, correction) {
  const m = create();
  const r = assemble(fs.readFileSync(new URL(`extras/clock/${file}`, root), 'utf8'));
  assert.deepEqual(r.errors, []);
  m.reset();
  m.run(at(50));
  for (const { addr, bytes } of r.blocks) bytes.forEach((v, i) => m.write(addr + i, v));
  time.forEach((v, i) => m.write(0x1d00 + i, v));
  if (correction !== undefined) {
    m.write(r.symbols.CORR, parseInt(correction.slice(0, 2), 16));
    m.write(r.symbols.CORR + 1, parseInt(correction.slice(2), 16));
  }
  m.write(0x1d03, 0xf9);
  m.write(0x1d04, 0x9a);
  for (const key of pmi80RunKeys('1C00')) {
    m.pressKey(key);
    m.run(at(holdMs));
    m.releaseKey(key);
    m.run(at(holdMs));
  }
  const loop = r.symbols.LOOP;
  const bcd = v => (v >> 4) * 10 + (v & 15);
  const passes = [], fractions = [];
  const end = m.cycles + seconds * SECOND + 20000;
  while (m.cycles < end) {
    if (m.cpu.pc === loop) {
      passes.push(m.cycles);
      fractions.push(bcd(m.read(0x1d03)) * 100 + bcd(m.read(0x1d04)));
    }
    m.cpu.step();
  }
  m.display.takeFrame(m.cycles);
  m.run(200000);
  const shown = litMasks(m.display.takeFrame(m.cycles), 9).map(x => DIGITS[x] ?? '?').join('');
  return { lengths: passes.slice(1).map((t, i) => t - passes[i]), fractions, time: [0, 1, 2].map(i => m.read(0x1d00 + i)), shown };
}

// The monitors, with how long a key is held to be taken (as in src/board/profiles.js).
const factory = { create: () => new Pmi80({ rom: rom('pmi80_monitor.bin') }), holdMs: 40 };
const pmi80c = { create: () => new Pmi80({ rom: rom('pmi80c_monitor.bin'), rom2: rom('pmi80c_games.bin') }), holdMs: 100 };

for (const [file, board, other] of [
  ['clock-pmi80.asm', factory, pmi80c],
  ['clock-pmi80c.asm', pmi80c, factory],
]) {
  test(`${file}: exact seconds on its monitor, over midnight`, () => {
    const { lengths, time, shown } = runClock(board, file, [0x23, 0x59, 0x58], 4);
    assert.equal(lengths.length, 3);
    for (const n of lengths) assert.equal(n, SECOND);
    assert.deepEqual(time, [0x00, 0x00, 0x02]);
    assert.equal(shown, '00-00-02 ');
  });

  test(`${file}: carries into minutes and hours`, () => {
    const { time, shown } = runClock(board, file, [0x09, 0x59, 0x59], 1.5);
    assert.deepEqual(time, [0x10, 0x00, 0x00]);
    assert.equal(shown, '10-00-00 ');
  });

  test(`${file}: about a tenth off on the other monitor`, () => {
    const { lengths } = runClock(other, file, [0x12, 0x00, 0x00], 3);
    const off = Math.abs(lengths[0] / SECOND - 1);
    assert.ok(off > 0.08 && off < 0.11, `${(off * 100).toFixed(1)} %`);
  });
}

// The calibrated clocks: a second is SHORT states, plus LEAP when the correction (in hundredths of
// a second a day, BCD, 5000 as typed in) added to the fraction passes 9999.
const SHORT = 1110468, LEAP = 1286;
function assertCorrected({ lengths, fractions }, correction) {
  lengths.forEach((n, i) => {
    const sum = fractions[i] + correction;
    assert.equal(fractions[i + 1], sum % 10000);
    assert.equal(n, SHORT + (sum >= 10000 ? LEAP : 0), `second ${i}`);
  });
}

for (const [file, board, other] of [
  ['clock-cal-pmi80.asm', factory, pmi80c],
  ['clock-cal-pmi80c.asm', pmi80c, factory],
]) {
  test(`${file}: as typed in, exact seconds on average on its monitor, over midnight`, () => {
    const run = runClock(board, file, [0x23, 0x59, 0x58], 4);
    const { lengths, time, shown } = run;
    assertCorrected(run, 5000);
    assert.equal(lengths[0] + lengths[1], 2 * SECOND);
    assert.deepEqual(time, [0x00, 0x00, 0x02]);
    assert.equal(shown, '00-00-02 ');
  });

  test(`${file}: carries into minutes and hours`, () => {
    const { time, shown } = runClock(board, file, [0x09, 0x59, 0x59], 1.5);
    assert.deepEqual(time, [0x10, 0x00, 0x00]);
    assert.equal(shown, '10-00-00 ');
  });

  test(`${file}: 70.81 slows it by 20.81 s a day`, () => {
    const run = runClock(board, file, [0x12, 0x00, 0x00], 6, '7081');
    assert.equal(run.lengths.length, 5);
    assertCorrected(run, 7081);
    // In the long run a second is SHORT + LEAP * 0.7081 states, 20.81 s a day more than SECOND.
    const perDay = (LEAP * 0.7081 + SHORT - SECOND) / SECOND * 86400;
    assert.ok(Math.abs(perDay - 20.81) < 0.01, perDay.toFixed(3));
  });

  test(`${file}: about a tenth off on the other monitor`, () => {
    const { lengths } = runClock(other, file, [0x12, 0x00, 0x00], 4);
    const off = Math.abs((lengths[0] + lengths[1]) / 2 / SECOND - 1);
    assert.ok(off > 0.08 && off < 0.11, `${(off * 100).toFixed(1)} %`);
  });
}

// AION Buzzer 80 in the second EPROM: the image is the one tried on a real board, and after
// EX 0400 = it gives the same sound as the RAM edition of the program list, under both monitors.
const AION_SHA256 = 'a171f618b26197aa33278587c0af64b76918daf2e9c003146eed0b9b6a54ae6b';
const aionImage = () => {
  const r = assemble(fs.readFileSync(new URL('extras/aion-buzzer-80-eprom/aion-buzzer-80-eprom-pmi80.asm', root), 'utf8'));
  assert.deepEqual(r.errors, []);
  return epromImage(epromBlocks(r));
};

test('aion-buzzer-80-eprom: one kibibyte from 0400, the image tried on the real board, signed at its end', async () => {
  const image = aionImage();
  assert.equal(image.length, 1024);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', image)).toString('hex');
  assert.equal(hash, AION_SHA256);
  assert.equal(Buffer.from(image.subarray(1012)).toString('latin1'), 'Wolf2026v101');
});

for (const [name, monitor, holdMs] of [['factory monitor', 'pmi80_monitor.bin', 40], ['PMI-80 C', 'pmi80c_monitor.bin', 100]]) {
  test(`aion-buzzer-80-eprom, ${name}: the sound of the RAM edition`, () => {
    const ram = parseIntelHex(fs.readFileSync(new URL('programs/aion-buzzer-80/AION-Buzzer-80-RAM-display.hex', root), 'utf8'));
    const EDGES = 12000; // about a sixth of the song
    const play = (m, start, load = []) => {
      m.reset();
      m.run(at(50));
      for (const { addr, bytes } of load) bytes.forEach((v, i) => m.write(addr + i, v));
      m.takeAudio();
      for (const key of pmi80RunKeys(start)) {
        m.pressKey(key);
        m.run(at(holdMs));
        m.releaseKey(key);
        m.run(at(holdMs));
      }
      m.run(at(15000));
      const edges = m.takeAudio().edges;
      return Array.from(edges.slice(1, EDGES + 1), (t, i) => t - edges[i]);
    };
    const inRom = play(new Pmi80({ rom: rom(monitor), rom2: aionImage() }), '0400');
    const inRam = play(new Pmi80({ rom: rom(monitor) }), '1C00', ram);
    assert.equal(inRom.length, EDGES);
    assert.deepEqual(inRom, inRam);
  });
}

// The clock in the second EPROM (extras/clock/clock-eprom-pmi80.asm): asks for the time (typed
// from the left, checked), for the correction and for =, then keeps the seconds of the calibrated
// clocks whatever the keys do; with an alarm and a stopwatch.
const EPROM_CLOCK = (() => {
  const r = assemble(fs.readFileSync(new URL('extras/clock/clock-eprom-pmi80.asm', root), 'utf8'));
  assert.deepEqual(r.errors, []);
  return { image: epromImage(epromBlocks(r)), s: r.symbols };
})();
// ' is segment b alone: the alarm is on
const EPROM_GLYPHS = { ...DIGITS, 0x39: 'C', 0x77: 'A', 0x38: 'L', 0x79: 'E', 0x50: 'r', 0x78: 't', 0x48: '=', 0x08: '_', 0x7c: 'b', 0x3e: 'U', 0x5e: 'd', 0x02: "'" };

// A board with the clock EPROM (the correction in it replaced, if given), started with
// EX 0400 =; `before(m)` may write to the RAM first.
function epromClock([, monitor, holdMs], { correction, before } = {}) {
  const { s } = EPROM_CLOCK;
  const image = Uint8Array.from(EPROM_CLOCK.image);
  if (correction) { image[s.CORR - 0x400] = parseInt(correction.slice(0, 2), 16); image[s.CORR - 0x3ff] = parseInt(correction.slice(2), 16); }
  const m = new Pmi80({ rom: rom(monitor), rom2: image });
  m.reset();
  m.run(at(50));
  before?.(m);
  const run = ms => m.run(at(ms));
  const start = () => { for (const key of pmi80RunKeys('0400')) { m.pressKey(key); run(holdMs); m.releaseKey(key); run(holdMs); } };
  start();
  const tap = key => { m.pressKey(key); run(50); m.releaseKey(key); run(110); };
  const type = keys => { for (const key of keys) tap(key); };
  const shown = () => { run(30); m.display.takeFrame(m.cycles); run(30); return litMasks(m.display.takeFrame(m.cycles), 9).map(x => EPROM_GLYPHS[x] ?? '?').join(''); };
  // what is shown, with the underscore of the cursor replaced by the digit under it (four looks
  // across its blink: a look may fall on the moment of the change)
  const field = () => { const looks = [shown(), (run(130), shown()), (run(130), shown()), (run(130), shown())]; return [...looks[0]].map((c, i) => looks.map(l => l[i]).find(x => x !== '_' && x !== '?') ?? c).join(''); };
  const bytes = (name, n) => Array.from({ length: n }, (_, i) => m.read(s[name] + i));
  // through the questions up to the prompt: the time typed (if given), the correction typed (if given)
  const set = (time, cal) => { run(1300); if (time) type(time); tap('='); if (cal) type(cal); tap('='); };
  const go = () => tap('=');                     // = at the prompt: the clock runs
  // Runs for n seconds, stepping; `each(k, m)` is called at the k-th pass of the main loop.
  // Returns the lengths of the seconds and of all rounds between the passes of LOOP.
  const watch = (n, each) => {
    const sec = [], rounds = [];
    let last = null, k = 0;
    const end = m.cycles + Math.round(n * SECOND) + 30000;
    while (m.cycles < end) {
      if (m.cpu.pc === s.SECOND) sec.push(m.cycles);
      if (m.cpu.pc === s.LOOP) { if (last !== null) rounds.push(m.cycles - last); last = m.cycles; each?.(k++, m); }
      m.cpu.step();
    }
    return { seconds: sec.slice(1).map((x, i) => x - sec[i]), rounds };
  };
  return { m, s, run, start, tap, type, shown, field, bytes, set, go, watch };
}
const correctedSeconds = (correction, n, fraction = 0) => { let f = fraction; return Array.from({ length: n }, () => { f += correction; const leap = f >= 10000; f %= 10000; return SHORT + (leap ? LEAP : 0); }); };
const fractionOf = c => { const [a, b] = c.bytes('FRAC', 2); return (a >> 4) * 1000 + (a & 15) * 100 + (b >> 4) * 10 + (b & 15); };

test('clock-eprom-pmi80: one kibibyte from 0400, the correction 50 00 in bytes 3 and 4, signed at its end', () => {
  const { image, s } = EPROM_CLOCK;
  assert.equal(image.length, 1024);
  assert.equal(image[0], 0xc3, 'a jump over the correction');
  assert.equal(s.CORR, 0x403);
  assert.deepEqual([image[3], image[4]], [0x50, 0x00]);
  assert.match(Buffer.from(image.subarray(1012)).toString('latin1'), /^Wolf2026v\d{3}$/);
  assert.ok(s.ROM_END <= 0x7f4);
});

for (const mon of [['factory monitor', 'pmi80_monitor.bin', 40], ['PMI-80 C', 'pmi80c_monitor.bin', 100]]) {
  const name = `clock-eprom-pmi80, ${mon[0]}`;

  test(`${name}: asks for the time from the left, refuses one that cannot be, then for the correction and =`, () => {
    const c = epromClock(mon);
    assert.equal(c.shown(), 'CA5      ', 'the label, a second long');
    c.run(1300);
    assert.equal(c.field(), '00-00-00 ', 'after power on the time is 00-00-00, whatever the RAM held');
    c.tap('1');
    assert.deepEqual(c.bytes('TIME', 3), [0x10, 0x00, 0x00], 'the first digit typed is the first of the hours');
    assert.equal(c.shown(), '10-00-00 ', 'the next place shows its digit first');
    c.run(150);
    assert.equal(c.shown(), '1_-00-00 ', 'and then the underscore, in turns');
    c.type(['A', 'EX', 'F', 'M', 'B', 'S']);
    assert.deepEqual(c.bytes('TIME', 3), [0x10, 0x00, 0x00], 'only 0-9 are digits');
    c.type('43000');
    assert.equal(c.field(), '14-30-00 ');
    c.tap('2');                                  // after the last digit the first again
    assert.equal(c.field(), '24-30-00 ');
    c.tap('=');
    assert.equal(c.shown(), 'Err      ');
    c.run(1300);
    assert.equal(c.field(), '24-30-00 ', 'asked again');
    c.type('235960'); c.tap('=');
    assert.equal(c.shown(), 'Err      ', 'sixty seconds');
    c.run(1300);
    c.type('235958');
    assert.equal(c.field(), '23-59-58 ');
    c.tap('=');
    assert.equal(c.field(), '50-00-CAL', 'the correction of the EPROM');
    c.type('70');
    assert.equal(c.field(), '70-00-CAL');
    c.type('81');
    assert.deepEqual(c.bytes('CAL', 2), [0x70, 0x81]);
    c.tap('=');
    assert.equal(c.shown(), '5tArt =  ');
    c.run(700);
    c.type(['5', 'EX', 'B', 'S']);
    assert.equal(c.shown(), '5tArt =  ', 'it waits for = and nothing else');
    assert.deepEqual(c.bytes('TIME', 3), [0x23, 0x59, 0x58], 'the time stands until then');
    c.m.pressKey('=');
    const { seconds, rounds } = c.watch(7, k => { if (k === 30) c.m.releaseKey('='); });
    assert.ok(seconds.length >= 5);
    assert.deepEqual(seconds, correctedSeconds(7081, seconds.length), 'corrected seconds, over midnight');
    assert.equal(Math.min(...rounds), rounds[0], 'every round of the loop the same, but the last of a second');
    assert.equal(rounds.filter(r => r !== rounds[0]).length, seconds.length + 1);
    const time = c.bytes('TIME', 3);
    assert.deepEqual(time.slice(0, 2), [0x00, 0x00]);
    assert.equal(c.shown(), `00-00-0${time[2]} `);
  });

  test(`${name}: the first second starts at the press of =, and 50.00 gives exact seconds on average`, () => {
    const c = epromClock(mon);
    c.set('095958');
    // from the press to the first full second: a second, less than a round
    c.run(300);
    c.m.pressKey('=');
    const t0 = c.m.cycles;
    const ticks = [];
    while (ticks.length < 5) { if (c.m.cpu.pc === c.s.SECOND) ticks.push(c.m.cycles); c.m.cpu.step(); }
    assert.ok(ticks[0] - t0 > SHORT - 12000 && ticks[0] - t0 <= SHORT + LEAP + 12000, String(ticks[0] - t0));
    const lengths = ticks.slice(1).map((x, i) => x - ticks[i]);
    assert.deepEqual(lengths, correctedSeconds(5000, lengths.length));
    assert.equal(lengths[0] + lengths[1], 2 * SECOND);
    assert.deepEqual(c.bytes('TIME', 3).slice(0, 2), [0x10, 0x00], 'carries into minutes and hours');
  });

  test(`${name}: whatever is pressed while it runs, every second and every round keeps its length`, () => {
    const c = epromClock(mon, { correction: '6347' });
    c.set('120000'); c.go();
    // keys by a fixed pseudo-random plan: all of them, through the alarm and the stopwatch
    const KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'EX', 'R', 'BR', 'M', 'L', 'S', '=', 'B', 'S', '=', 'S', 'B'];
    let seed = 12345, down = null;
    const next = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    const first = fractionOf(c);
    const { seconds, rounds } = c.watch(40, (k, m) => {
      if (k % 7) return;
      if (down) { m.releaseKey(down); down = null; } else if (next() < 0.8) { down = KEYS[Math.floor(next() * KEYS.length)]; m.pressKey(down); }
    });
    assert.ok(seconds.length >= 38);
    assert.deepEqual(seconds, correctedSeconds(6347, seconds.length, first));
    const plain = rounds[0];
    assert.equal(rounds.filter(r => r !== plain).length, seconds.length + 1, 'only the last round of a second is longer');
    assert.ok(rounds.every(r => r >= plain));
    assert.deepEqual(c.bytes('TIME', 3).slice(0, 2), [0x12, 0x00]);
  });

  test(`${name}: the stopwatch counts hundredths with the clock, stops, clears and goes on behind the clock`, () => {
    const c = epromClock(mon);
    c.set('120000'); c.go();
    c.tap('S');
    assert.equal(c.shown(), '00-00-00 ');
    assert.equal(c.m.read(c.s.VIEW), 8);
    c.m.pressKey('=');
    let from = null;
    const rounds = [];
    c.watch(3.3, (k, m) => { if (m.read(c.s.SWRUN) && from === null) from = k; if (k === 20) m.releaseKey('='); rounds.push(k); });
    const ran = rounds.length - from;             // rounds since it was started: hundredths
    const bcd = v => (v >> 4) * 10 + (v & 15);
    const value = () => { const [mm, ss, hh] = c.bytes('SWMIN', 3); return bcd(mm) * 6000 + bcd(ss) * 100 + bcd(hh); };
    assert.ok(Math.abs(value() - ran) <= 1, `${value()} hundredths after ${ran} rounds`);
    assert.ok(value() > 300);
    c.tap('S');                                   // the clock again; the stopwatch goes on
    assert.match(c.shown(), /^12-00-0\d $/);
    const before = value();
    c.run(1000);
    assert.ok(Math.abs(value() - before - 100) <= 2);
    c.tap('S'); c.tap('=');                       // stopped
    const stopped = value();
    c.run(500);
    assert.equal(value(), stopped);
    const [mm, ss, hh] = c.bytes('SWMIN', 3).map(v => v.toString(16).padStart(2, '0'));
    assert.equal(c.shown(), `${mm}-${ss}-${hh} `);
    c.tap('=');                                   // and on from there
    c.run(300);
    assert.ok(value() > stopped);
    c.tap('0');                                   // 0 clears and stops it
    c.run(200);
    assert.equal(value(), 0);
    assert.equal(c.shown(), '00-00-00 ');
    // a minute: 59.99 -> 01-00-00
    [0x00, 0x59, 0x98].forEach((v, i) => c.m.write(c.s.SWMIN + i, v));
    c.tap('='); c.run(300);
    assert.equal(c.bytes('SWMIN', 1)[0], 0x01);
    assert.equal(c.bytes('SWMIN', 2)[1], 0x00);
  });

  test(`${name}: the alarm is typed after B, shows its sign, beeps at its time until a key, and B turns it off`, () => {
    const c = epromClock(mon);
    c.set('065957'); c.go();
    assert.match(c.shown(), /^06-59-5\d $/, 'no sign: the alarm is off');
    c.tap('B');
    assert.equal(c.field(), '00-00-bUd');
    c.tap('0');
    c.run(350);
    assert.equal(c.shown(), '0_-00-bUd', 'the underscore at the place typed');
    c.type('700');
    assert.deepEqual(c.bytes('ALARM', 2), [0x07, 0x00]);
    c.type(['A', 'S', 'EX']);                     // nothing
    assert.equal(c.m.read(c.s.VIEW), 4);
    c.tap('=');
    assert.equal(c.m.read(c.s.ALON), 1);
    assert.match(c.shown(), /^0[67]-\d\d-\d\d'$/, 'the clock again, with the sign of the alarm');
    c.m.takeAudio();
    const quiet = () => c.m.takeAudio().edges.length;
    while (c.bytes('TIME', 3)[0] !== 0x07) c.run(100);
    assert.equal(c.m.read(c.s.RINGS), 60);
    c.run(1500);
    assert.ok(quiet() > 200, 'it beeps');
    assert.ok(c.m.read(c.s.RINGS) < 60, 'counting down its minute');
    c.tap('5');                                   // any key
    assert.equal(c.m.read(c.s.RINGS), 0);
    assert.equal(c.m.read(c.s.VIEW), 0, 'that key did nothing else');
    c.run(200); quiet();
    c.run(1500);
    assert.equal(quiet(), 0, 'silent');
    assert.match(c.shown(), /^07-00-0\d'$/, 'still on, for tomorrow');
    c.tap('B');
    assert.equal(c.field(), '07-00-bUd', 'its time is kept');
    c.tap('B');
    assert.equal(c.m.read(c.s.ALON), 0);
    assert.match(c.shown(), /^07-00-\d\d $/, 'off: no sign');
    // the stopwatch shows the sign too, and a ringing left alone ends after its minute
    c.m.write(c.s.RINGS, 2);
    c.run(2500);
    assert.equal(c.m.read(c.s.RINGS), 0);
  });

  test(`${name}: after RE it offers the time it was stopped at, the correction used last and the alarm`, () => {
    const c = epromClock(mon, { correction: '4319' });
    c.run(1300);
    c.type('120000'); c.tap('=');
    assert.equal(c.field(), '43-19-CAL');
    c.type('9999'); c.tap('='); c.tap('=');
    c.tap('B'); c.type('0630'); c.tap('=');
    c.run(2500);
    const stopped = c.bytes('TIME', 3);
    assert.deepEqual(stopped.slice(0, 2), [0x12, 0x00]);
    c.m.reset();                                 // RE: the RAM stays
    c.run(100);
    c.start();
    c.run(1300);
    assert.equal(c.field(), `12-00-0${stopped[2]}'`, 'the time, and the alarm still on');
    c.tap('=');
    assert.equal(c.field(), '99-99-CAL', 'the correction typed last time');
    c.tap('='); c.run(100);
    c.tap('=');
    const first = fractionOf(c);
    const { seconds } = c.watch(4);
    assert.deepEqual(seconds, correctedSeconds(9999, seconds.length, first));
    assert.deepEqual(c.bytes('ALARM', 2), [0x06, 0x30]);
  });

  test(`${name}: RAM that is not marked as its own, or holds a time that cannot be, gives 00-00-00`, () => {
    const { s } = EPROM_CLOCK;
    for (const [why, time, mark, expected] of [
      ['a good time, marked', [0x08, 0x15, 0x30], true, '08-15-30 '],
      ['a good time, not marked', [0x08, 0x15, 0x30], false, '00-00-00 '],
      ['not BCD', [0x0a, 0x15, 0x30], true, '00-00-00 '],
      ['hour 24', [0x24, 0x00, 0x00], true, '00-00-00 '],
      ['minute 60', [0x12, 0x60, 0x00], true, '00-00-00 '],
    ]) {
      const c = epromClock(mon, { before: m => {
        for (let a = s.MARK; a <= s.ALON; a++) m.write(a, 0);
        time.forEach((v, i) => m.write(s.TIME + i, v));
        m.write(s.CAL, 0x12); m.write(s.CAL + 1, 0x34);
        if (mark) { m.write(s.MARK, 0x5a); m.write(s.MARK + 1, 0xa5); }
      } });
      c.run(1300);
      assert.equal(c.field(), expected, why);
      c.tap('=');
      assert.equal(c.field(), mark ? '12-34-CAL' : '50-00-CAL', why);
    }
  });
}

// SFMT80 (extras/sfmt80/sfmt80-pmi80.asm): the Science Fair Microcomputer Trainer in the two EPROMs
// of the PMI-80, in place of the monitor. Its behaviour is compared with the original outside this
// repository (the tests need the trainer's ROM); here: the image, and that it lives.
const SFMT80_SHA256 = ['571a69d32c2227d0167c0bef703ffd821b016c12df4463fdb3b2caa5d1c9efd2', 'd31d2b79b3dd127d77ee5162fe5a4f144b6d4c22c650d13648ac2f8d950c1748'];
const sfmt80Image = () => {
  const r = assemble(fs.readFileSync(new URL('extras/sfmt80/sfmt80-pmi80.asm', root), 'utf8'));
  assert.deepEqual(r.errors, []);
  return epromImage(epromBlocks(r));
};

test('sfmt80: two kibibytes from 0000, the two EPROM images as published', async () => {
  const image = sfmt80Image();
  assert.equal(image.length, 2048);
  for (const [i, sha] of SFMT80_SHA256.entries()) {
    const half = image.subarray(i * 1024, i * 1024 + 1024);
    assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256', half)).toString('hex'), sha);
    assert.deepEqual(new Uint8Array(fs.readFileSync(new URL(`extras/sfmt80/sfmt80-pmi80-0${i * 4}00.bin`, root))), half);
  }
});

for (const [name, create] of [
  ['in the two EPROM sockets', image => new Pmi80({ rom: image.subarray(0, 1024), rom2: image.subarray(1024) })],
  ['as a custom ROM over the factory monitor', image => new Pmi80({ rom: rom('pmi80_monitor.bin'), customRom: [{ addr: 0, bytes: image }] })],
]) {
  test(`sfmt80 ${name}: the monitor shows F, takes keys with a click, keeps a nibble and starts a built-in program`, () => {
    const m = create(sfmt80Image());
    m.reset();
    const shown = () => { m.display.takeFrame(m.cycles); m.run(at(40)); return litMasks(m.display.takeFrame(m.cycles), 9); };
    const tap = key => { m.pressKey(key); m.run(at(60)); m.releaseKey(key); m.run(at(60)); };
    m.run(at(50));
    assert.deepEqual(shown(), [0, 0, 0, 0, 0, 0, 0, 0, 0x71], 'F at address 00 after the start');
    m.takeAudio();
    tap('5');
    assert.equal(m.takeAudio().edges.length, 32, 'the click of a key: 16 periods');
    assert.equal(shown()[8], 0x6d, 'the digit typed');
    tap('L');                                       // INCR stores it; address 01 on the LEDs
    assert.deepEqual(shown(), [0, 0, 0, 0, 0, 0, 0x08, 0, 0x71]);
    tap('=');                                       // RESET: back at address 00
    assert.deepEqual(shown(), [0, 0, 0, 0, 0, 0, 0, 0, 0x6d]);
    for (const key of ['C', 'S', '4']) tap(key);    // rat bashing at speed 4: one LED within three seconds
    let rat = null;
    for (let i = 0; i < 75 && !rat; i++) { const leds = shown().slice(0, 7); if (leds.filter(x => x === 0x08).length === 1) rat = leds; }
    assert.ok(rat, 'a rat shows');
    tap('=');
    assert.equal(shown()[8], 0x6d, 'RESET returns to the monitor with the memory kept');
  });
}
