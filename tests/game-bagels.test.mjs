// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
//
// Bagels runs through the real monitor launch sequence on every supported firmware.
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
const roms = Object.fromEntries(Object.entries(romFiles).map(([k, f]) =>
  [k, fs.readFileSync(new URL('roms/' + f, root))]));
const font = [0x40, 0x79, 0x24, 0x30, 0x19, 0x12, 0x02, 0x78,
  0, 0x10, 0x08, 0x03, 0x46, 0x21, 0x06, 0x0e];
const letters = s => [...s].map(c => parseInt(c, 16));

function setup(board, fw) {
  const profile = BOARD_PROFILES[board];
  const suffix = board === 'savia84' ? 'savia' : board;
  const data = fs.readFileSync(new URL(`programs/bagels/bagels-${suffix}.asm`, root));
  const source = data.toString('utf8');
  const asm = assemble(source);
  assert.deepEqual(asm.errors, []);
  const s = asm.symbols;
  assert.equal(s.START, board === 'pmi80' ? 0x1c00 : 0x1800);
  for (const b of asm.blocks) {
    assert.ok(b.addr >= s.START && b.addr + b.bytes.length <= s.CODE_END);
  }
  const version = source.match(/^; Bagels .* version (\d\.\d\.\d):/m)?.[1];
  assert.equal(version, '0.1.1');
  assert.match(source, /^; 0\.1\.1  /m, 'version history includes the signature release');
  const signature = [...Buffer.from('Wolf2026v' + version.replaceAll('.', ''), 'ascii')];
  const last = asm.blocks.at(-1);
  assert.equal(last.addr + last.bytes.length, s.CODE_END, 'signature ends the emitted image');
  assert.equal(s.IMAGE_SIGNATURE, s.CODE_END - signature.length);
  assert.deepEqual([...last.bytes.slice(-signature.length)], signature);
  assert.equal(s.CODE_END, s.VARS, 'DS variables immediately follow the signature');
  assert.equal(s.STACK_BOTTOM, board === 'pmi80' ? 0x1fac : 0x1fa0);
  assert.ok(s.VARS_END <= s.STACK_BOTTOM);
  assert.equal(s.STACK_TOP, 0x1fc0);
  const m = fw.create(roms);
  const at = ms => Math.round(ms * profile.clockHz / 1000);
  const run = ms => { m.run(at(ms)); assert.equal(m.cpu.halted, false); };
  let active = false, minSp = s.STACK_TOP, firstProgramCycle;
  const enter = () => {
    if (!active && m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END) {
      active = true;
      firstProgramCycle = m.cycles;
    }
  };
  const write = m.cpu.bus.write;
  m.cpu.bus.write = (a, v) => {
    enter();
    if (active) {
      assert.ok((a >= s.VARS && a < s.VARS_END) || (a >= s.STACK_BOTTOM && a < s.STACK_TOP),
        `write outside game variables/stack: ${a.toString(16)}`);
      minSp = Math.min(minSp, m.cpu.sp);
    }
    write(a, v);
  };
  const output = m.cpu.bus.output;
  m.cpu.bus.output = (p, v) => {
    enter();
    if (active && (p & 0xff) === 0xf8 && (v & 0x80)) {
      assert.equal(board, 'pmi80', 'Savia and Stone 1 must stay silent');
      assert.ok(m.cpu.pc >= s.SOUND_SLOT && m.cpu.pc < s.SOUND_CODE_END,
        'PA7 may rise only inside a tone slot');
      assert.equal(v & 0x40, 0x40, 'g must be off while PA7 is high');
    }
    output(p, v);
  };
  const entry = { id: 'bagels-' + suffix, board, format: 'asm', start: s.START.toString(16).toUpperCase() };
  startProgram(m, entry, data, { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys });
  assert.ok(active);
  const read = name => m.read(s[name]);
  const put = (name, value) => m.write(s[name], value);
  const bytes = (name, n) => Array.from({ length: n }, (_, i) => m.read(s[name] + i));
  const tap = (key, hold = 60) => { m.pressKey(key); run(hold); m.releaseKey(key); run(35); };
  const screen = () => {
    m.display.takeFrame(m.cycles);
    run(40);
    return litMasks(m.display.takeFrame(m.cycles), 9);
  };
  const until = (condition, maxMs = 5000) => {
    const begin = m.cycles;
    while (!condition() && m.cycles - begin < at(maxMs)) run(1);
    assert.ok(condition(), `condition timed out at PC ${m.cpu.pc.toString(16)}`);
    return (m.cycles - begin) * 1000 / profile.clockHz;
  };
  const fixSecret = secret => {
    letters(secret).forEach((v, i) => m.write(s.SECRET + i, v));
    put('PENDING', 0);
  };
  // Call a leaf/subroutine on its actual CPU, returning to the idle game loop.
  const call = name => {
    m.cpu.sp = s.STACK_TOP - 2;
    m.write(m.cpu.sp, s.MAIN & 255);
    m.write(m.cpu.sp + 1, s.MAIN >> 8);
    m.cpu.pc = s[name];
    let steps = 0;
    do { m.cpu.step(); assert.ok(++steps < 10000); } while (m.cpu.pc !== s.MAIN);
  };
  return { m, s, profile, at, run, read, put, bytes, tap, screen, until, fixSecret, call,
    firstProgramCycle: () => firstProgramCycle, minSp: () => minSp };
}

for (const fw of BOARD_PROFILES.pmi80.firmware) {
  test(`pmi80/${fw.id}: H for a guess, HH for a win, L for a revealed loss`, t => {
    const h = setup('pmi80', fw);
    const { m, s, run, tap, bytes, fixSecret, put } = h;
    const tones = [];
    let tone = null;
    const output = m.cpu.bus.output;
    m.cpu.bus.output = (p, v) => {
      output(p, v);
      if ((p & 255) === 0xfa && tone) {
        const column = (~v) & 15;
        if (column < 9) tone.columns.add(column);
      }
      if ((p & 255) !== 0xf8) return;
      if (m.cpu.pc === s.SOUND_PA_SAMPLE + 2 && m.cpu.d === 0x40) {
        if (!tone) {
          const quiet = m.takeAudio();
          const gapFrame = m.display.takeFrame(m.cycles);
          if (tones.length) {
            assert.equal(quiet.edges.length, 0, 'PA7 stays low between tones');
          }
          tone = { start: m.cycles, pa: [], columns: new Set(),
            expected: bytes('DISPLAY', 9), gapFrame };
        }
        tone.pa.push({ time: m.cycles, value: v, column: m.cpu.e });
      }
      if (m.cpu.pc === s.SOUND_PA_END + 2) {
        assert.ok(tone);
        tone.end = m.cycles;
        tone.edges = m.takeAudio().edges;
        tone.masks = litMasks(m.display.takeFrame(m.cycles), 9);
        tones.push(tone);
        tone = null;
      }
    };
    tap('A');
    fixSecret('CBFB');
    for (const key of 'BAFD') tap(key);
    assert.equal(tones.length, 1, 'one high tone for a scored guess');
    run(3300);
    tap('0');
    fixSecret('AAAA');
    for (const key of 'AAAA') tap(key);
    run(40);
    assert.equal(tones.length, 3, 'win replaces H with exactly two high tones');
    const ms = states => states * 1000 / h.profile.clockHz;
    const gap = ms(tones[2].start - tones[1].end);
    assert.ok(Math.abs(gap - 40) < 1, `HH gap ${gap} ms`);
    assert.deepEqual(litMasks(tones[2].gapFrame, 9),
      tones[2].expected.map(v => (~v) & 0x7f), 'full display, including g, during HH gap');
    run(3300);
    // The regular gameplay test reaches this state through all ten losing guesses.
    put('EXACT', 0); put('COUNT', 0); put('STATE', 1);
    fixSecret('CBFB');
    tap('C');
    assert.equal(tones.length, 4, 'one low tone when the solution is revealed');
    assert.equal(h.read('STATE'), 2);
    for (let n = 0; n < tones.length; n++) {
      const tone = tones[n], low = n === 3;
      assert.equal(tone.pa.length, 60, 'multiplex keeps scanning all tone slots');
      assert.deepEqual([...tone.columns].sort(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      tone.pa.forEach(({ value, column }, i) => {
        assert.equal(value & 0x7f, tone.expected[column] | 0x40, 'only g is forced off');
        assert.equal(value & 0x80, (Math.floor(i / (low ? 2 : 1)) % 2) * 0x80);
      });
      assert.deepEqual(tone.masks, tone.expected.map(v => (~v) & 0x3f),
        'all nine digits show their other segments throughout the tone');
      assert.equal(tone.edges.length, low ? 30 : 60, 'actual K3 edge count');
      const halfPeriods = tone.edges.slice(1, -1).map((v, i) => v - tone.edges[i]);
      assert.equal(new Set(halfPeriods).size, 1, 'constant K3 half-period through digit wrap');
      const hz = h.profile.clockHz / (2 * halfPeriods[0]);
      assert.ok(Math.abs(hz - (low ? 500 : 1000)) < 10, `carrier ${hz} Hz`);
      const duration = ms(tone.end - tone.start);
      assert.ok(Math.abs(duration - 30) < 0.5, `tone ${duration} ms`);
      t.diagnostic(`${low ? 'L' : 'H'}: ${hz.toFixed(3)} Hz, ${duration.toFixed(4)} ms`);
    }
    run(60);
    m.takeAudio();
    m.display.takeFrame(m.cycles);
    run(40);
    assert.equal(m.takeAudio().edges.length, 0, 'silence after the tone');
    assert.equal(m.ppi.outputA() & 0x80, 0);
    assert.deepEqual(litMasks(m.display.takeFrame(m.cycles), 9),
      bytes('DISPLAY', 9).map(v => (~v) & 0x7f), 'normal g segments restored');
    t.diagnostic(`HH silent gap ${gap.toFixed(4)} ms`);
  });
}

for (const board of ['pmi80', 'savia84', 'stone1']) {
  for (const fw of BOARD_PROFILES[board].firmware) {
    const label = `${board}/${fw.id}`;
    test(`${label}: title, scoring, repeats, win, loss and next-key carry-over`, () => {
      const h = setup(board, fw);
      const { m, s, run, read, bytes, tap, screen, until, fixSecret } = h;
      assert.deepEqual(screen(), [0, 0, 0x7c, 0x77, 0x3d, 0x79, 0x38, 0x6d, 0]);
      assert.equal(read('POINTER'), 0, 'launch key is ignored');
      tap('A'); // Skip title; this A must not become input.
      assert.equal(read('COUNT'), 9);
      assert.equal(read('POINTER'), 0);
      assert.deepEqual(screen(), [0x6f, 0, 0, 0, 0, 0, 0, 0, 0]);
      // Both otherwise unused columns still scan numeric keys on an eight-digit Savia.
      for (const key of ['0', '2', '4', '6', 'M', '=']) tap(key);
      assert.equal(read('POINTER'), 0);
      m.pressKey('A'); run(2); m.releaseKey('A'); run(35);
      assert.equal(read('POINTER'), 0, 'a short bounce is not a press');
      fixSecret('CBFB');
      tap('B', 250); // Holding cannot supply repeated letters.
      assert.equal(read('POINTER'), 1);
      m.pressKey('A'); run(60); m.releaseKey('A'); run(35);
      tap('F'); tap('D');
      assert.deepEqual(bytes('DISPLAY', 9), [font[9], 0x7f, ...letters('BAFD').map(v => font[v]), 0x7f, font[1], font[1]]);
      assert.deepEqual(screen(), bytes('DISPLAY', 9).map(v => (~v) & 0x7f));
      tap('E'); // Ignored during the forced result pause.
      assert.equal(read('STATE'), 1);
      assert.equal(read('POINTER'), 4);
      run(3300);
      tap('A'); // Explicitly retained as the next guess's first letter.
      assert.equal(read('POINTER'), 1);
      assert.equal(read('COUNT'), 8);
      assert.equal(read('GUESS'), 10);
      fixSecret('AABB');
      for (const key of ['B', 'A', 'B']) tap(key);
      assert.deepEqual([read('EXACT'), read('MISPLACED')], [2, 2]);
      run(3300);
      tap('0'); // A non-letter clears the result, without entering a letter.
      assert.equal(read('POINTER'), 0);
      assert.equal(read('COUNT'), 7);
      fixSecret('AABB');
      for (const key of 'AABB') tap(key);
      assert.deepEqual([read('EXACT'), read('MISPLACED')], [4, 0]);
      run(3300);
      const tickBefore = bytes('RND', 6);
      tap('F');
      assert.equal(read('COUNT'), 9);
      assert.equal(read('POINTER'), 1);
      assert.equal(read('GUESS'), 15);
      assert.notDeepEqual(bytes('RND', 6), tickBefore, 'new game reseeds and generates');
      // Complete ten losing guesses. Count means attempts left AFTER this guess.
      fixSecret('AAAA');
      for (const key of 'BBB') tap(key);
      for (let attempt = 1; attempt <= 10; attempt++) {
        assert.equal(read('COUNT'), 10 - attempt);
        assert.deepEqual([read('EXACT'), read('MISPLACED')], [0, 0]);
        assert.equal(read('STATE'), 1);
        run(3300);
        if (attempt < 10) for (const key of 'BBBB') tap(key);
      }
      tap('C'); // The next key after the tenth result reveals, not an eleventh guess.
      assert.equal(read('STATE'), 2);
      assert.deepEqual(bytes('DISPLAY', 9), [font[0], 0x7f, font[10], font[10], font[10], font[10], 0x7f, 0x1c, 0x7f]);
      assert.deepEqual(screen(), bytes('DISPLAY', 9).map(v => (~v) & 0x7f));
      // A held key through the entire lock must be released before play resumes.
      m.pressKey('E'); run(3400);
      assert.equal(read('STATE'), 2);
      m.releaseKey('E'); run(60);
      tap('D');
      assert.equal(read('STATE'), 0);
      assert.equal(read('COUNT'), 9);
      assert.equal(read('POINTER'), 1);
      assert.equal(read('GUESS'), 13);
      assert.ok(h.minSp() >= s.STACK_BOTTOM);
      assert.equal(h.minSp(), s.STACK_TOP - 14, 'deepest scan path uses fourteen stack bytes');
      assert.deepEqual(bytes('IMAGE_SIGNATURE', 12), [...Buffer.from('Wolf2026v011', 'ascii')],
        'signature survives initialization and complete games');
      assert.ok(m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END);
    });

    test(`${label}: timing, reference generator and duplicate-aware score vectors`, t => {
      const h = setup(board, fw);
      const { m, s, run, read, put, bytes, until, call } = h;
      until(() => read('COUNT') === 9);
      const titleMs = (m.cycles - h.firstProgramCycle()) * 1000 / h.profile.clockHz;
      assert.ok(titleMs > 1900 && titleMs < 2300, `title ${titleMs} ms`);
      // Measure an idle frame with CPU states, without relying on host time.
      const frameStart = m.cycles;
      const ticks = m.read(s.TICKS) | (m.read(s.TICKS + 1) << 8);
      until(() => ((m.read(s.TICKS) | (m.read(s.TICKS + 1) << 8)) - ticks + 65536) % 65536 >= 100);
      const frameMs = (m.cycles - frameStart) * 10 / h.profile.clockHz;
      t.diagnostic(`title ${titleMs.toFixed(2)} ms; idle frame ${frameMs.toFixed(4)} ms`);
      assert.ok(frameMs > 4.4 && frameMs < 4.6, `frame ${frameMs} ms`);
      // Test the original generator without the intentional per-game seed mixing.
      [0, 0, 0, 0, 1, 0].forEach((v, i) => m.write(s.RND + i, v));
      const codes = [];
      for (let game = 0; game < 8; game++) {
        const code = [];
        for (let digit = 3; digit >= 0; digit--) { call('RANDOM'); code[digit] = m.cpu.a.toString(16).toUpperCase(); }
        codes.push(code.join(''));
      }
      assert.deepEqual(codes, ['AFEC', 'CCED', 'CDCA', 'EBEB', 'FDBE', 'FFAE', 'CBEF', 'AFDD']);
      const seeds = [];
      for (const fill of [0, 255]) {
        for (const ticks of [1, 42]) {
          for (let i = 0; i < 6; i++) m.write(s.RND + i, fill);
          m.write(s.TICKS, ticks); m.write(s.TICKS + 1, 0);
          call('MAKE_SECRET');
          assert.ok(bytes('SECRET', 4).every(v => v >= 10 && v <= 15));
          assert.notDeepEqual(bytes('RND', 6), Array(6).fill(255), 'reseeding escapes FF fixed point');
          seeds.push(bytes('RND', 6));
        }
      }
      assert.notDeepEqual(seeds[0], seeds[1], 'first-letter waiting time affects a zero seed');
      assert.notDeepEqual(seeds[2], seeds[3], 'first-letter waiting time affects an FF seed');
      const vectors = [['CBFB', 'BAFD', 1, 1], ['AAAA', 'AAAA', 4, 0], ['ABCD', 'DCBA', 0, 4],
        ['AABB', 'ABAB', 2, 2], ['AAAA', 'AABB', 2, 0], ['ABCA', 'AAAA', 2, 0],
        ['BBBA', 'ABBB', 2, 2], ['AABB', 'BBAA', 0, 4], ['ABCD', 'ABCE', 3, 0],
        ['FFFF', 'FEDC', 1, 0], ['CACF', 'BBBB', 0, 0]];
      for (const [secret, guess, exact, elsewhere] of vectors) {
        letters(secret + guess).forEach((v, i) => m.write(s.SECRET + i, v));
        call('SCORE');
        assert.deepEqual([read('EXACT'), read('MISPLACED')], [exact, elsewhere], `${secret}/${guess}`);
        assert.deepEqual(bytes('SECRET', 4), letters(secret), 'score preserves secret');
      }
      // Measure the result lock itself, including its final release requirement.
      m.cpu.sp = s.STACK_TOP - 2;
      m.write(m.cpu.sp, s.MAIN & 255); m.write(m.cpu.sp + 1, s.MAIN >> 8);
      m.cpu.pc = s.LOCK;
      put('ARMED', 1);
      const begin = m.cycles;
      let steps = 0;
      do { m.cpu.step(); assert.ok(++steps < 3000000); } while (m.cpu.pc !== s.MAIN);
      const lockMs = (m.cycles - begin) * 1000 / h.profile.clockHz;
      t.diagnostic(`result lock ${lockMs.toFixed(2)} ms; binary ${s.CODE_END - s.START} bytes; variables ${s.VARS_END - s.VARS} bytes`);
      assert.ok(Math.abs(lockMs - 3200) < 6, `lock ${lockMs} ms`);
      run(20);
    });
  }
}
