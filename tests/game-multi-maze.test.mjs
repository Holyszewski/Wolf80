// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Matěj "Wolf" Holyszewski
// Multi-Maze on every board and firmware: the published data, a model of the original rules
// (maze words, patches, window, moves) compared with the running program, a shortest-path
// walk to the exit, timing, keys, and on the PMI-80 the tones on K3.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assemble } from '../src/asm/asm8080.js';
import { BOARD_PROFILES } from '../src/board/profiles.js';
import { startProgram } from '../src/machine/programs.js';
import { litMasks } from '../src/machine/display.js';

const root = new URL('../', import.meta.url);
const romNames = {
  pmi80: 'pmi80/pmi80_monitor.bin', pmi80c: 'pmi80/pmi80c_monitor.bin',
  pmi80cgames: 'pmi80/pmi80c_games.bin', savia84: 'savia84/savia84_monitor.bin',
  stonepmi: 'stone1/stone_pmi.bin',
};
const roms = Object.fromEntries(Object.entries(romNames).map(([k, v]) =>
  [k, fs.readFileSync(new URL(`roms/${v}`, root))]));

// ---- The original's data (specification section 2.1) and rules, as a model
const hex = text => text.trim().split(/\s+/).map(h => parseInt(h, 16));
const BEFORE = hex('40 DA 02 08'); // columns k = -2 and -1, the bytes in front of MAZE
const MAZE = hex(`FF FF 04 00 F5 7F 15 00 41 FE 5F 04 51 7D 5D 04
                  51 B6 54 14 F7 D5 04 54 7F 5E 01 00 FD FF 00 00
                  00 00 00 00 00 00 00 00 00 00`);
const PLACE = hex('05 0B 10 10 14 18 17 10');
const POINT1 = hex('01 04 80 10 80 02 40 40');
const POINT2 = hex('02 02 40 01 10 04 80 10');
const BASE = [...BEFORE, ...MAZE];
const STACK_BYTES = 12; // reserved for the stack; the deepest call chain needs 10
const DIGITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
const TITLE = [0x2b, 0x3e, 0x38, 0x78, 0x30, 0x40, 0x2b, 0x77, 0x5b, 0x79]; // MULtI-MAZE
const word = (b, k) => (b[(k + 2) * 2] << 8) | b[(k + 2) * 2 + 1];
const wall = (b, k, r) => r < 0 || r > 15 || k < -2 || k > 20 || ((word(b, k) >> (15 - r)) & 1) === 1;
// Eight patches by the bits of the random byte, XORed cumulatively into the maze bytes.
function patched(b, random) {
  const out = [...b];
  for (let x = 0; x < 8; x++) if ((random >> x) & 1) {
    out[4 + PLACE[x]] ^= POINT1[x];
    out[4 + PLACE[x] + 2] ^= POINT2[x];
  }
  return out;
}
// What the display shows: positions 2-8 are the columns p+3 ... p-3; a = row above, g = row, d = below.
function windowOf(b, p, row) {
  const out = [0, 0];
  for (let j = 0; j < 7; j++) {
    const k = p + 3 - j;
    out.push((wall(b, k, row - 1) ? 0x01 : 0) | (wall(b, k, row) ? 0x40 : 0) | (wall(b, k, row + 1) ? 0x08 : 0));
  }
  return out;
}
const MOVE_KEYS = { up: [0, -1, '9'], down: [0, 1, '1'], left: [1, 0, '4'], right: [-1, 0, '6'] };
// A column k + 1 lies to the LEFT of k. The exit is column 15, the first free one behind the maze.
function shortest(b) {
  const seen = new Map([['1,6', []]]);
  const queue = [[1, 6]];
  for (let q = 0; q < queue.length; q++) {
    const [k, r] = queue[q];
    const path = seen.get(`${k},${r}`);
    if (k === 15) return path;
    for (const [dk, dr, key] of Object.values(MOVE_KEYS)) {
      const nk = k + dk, nr = r + dr;
      if (wall(b, nk, nr) || seen.has(`${nk},${nr}`)) continue;
      seen.set(`${nk},${nr}`, [...path, key]);
      queue.push([nk, nr]);
    }
  }
  return null;
}

// A generated maze: 7 x 8 cells at the odd columns 1-13 and the even rows 0-14, joined by 55
// opened walls into one tree (exactly one way between two cells), the exit at column 14, row 6;
// columns -2 and -1 and the open space as published.
function checkGenerated(b, what) {
  assert.deepEqual(b.slice(0, 4), BEFORE, `${what}: columns -2 and -1`);
  assert.deepEqual(b.slice(34), Array(12).fill(0), `${what}: the open space`);
  const isCell = (k, r) => k % 2 === 1 && k <= 13 && r % 2 === 0 && r <= 14;
  let passages = 0;
  for (let k = 0; k <= 14; k++) for (let r = 0; r < 16; r++) {
    const w = wall(b, k, r);
    if (isCell(k, r) || (k === 14 && r === 6)) assert.equal(w, false, `${what}: square ${k},${r} is open`);
    else if (k === 0 || k === 14 || r === 15 || (k % 2 === 0 && r % 2 === 1)) assert.equal(w, true, `${what}: square ${k},${r} is a wall`);
    else if (!w) passages++;
  }
  assert.equal(passages, 55, `${what}: opened walls`);
  const seen = new Set(['1,6']);
  const queue = [[1, 6]];
  for (let q = 0; q < queue.length; q++) {
    const [k, r] = queue[q];
    for (const [dk, dr] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
      const nk = k + dk, nr = r + dr;
      if (nk < 1 || nk > 13 || wall(b, nk, nr) || seen.has(`${nk},${nr}`)) continue;
      seen.add(`${nk},${nr}`);
      queue.push([nk, nr]);
    }
  }
  assert.equal([...seen].filter(c => isCell(...c.split(',').map(Number))).length, 56, `${what}: every cell can be reached`);
}
// The patch byte of a change of the original maze, read back from the changed bytes.
const patchByte = (before, after) => PLACE.reduce((v, place, x) => v | ((before[4 + place] ^ after[4 + place]) & POINT1[x] ? 1 << x : 0), 0);

test('all 256 maze variants can be solved, and a second use of a patch byte undoes it', () => {
  for (let v = 0; v < 256; v++) {
    const b = patched(BASE, v);
    const path = shortest(b);
    assert.ok(path && path.length > 20, `variant ${v}`);
    assert.deepEqual(patched(b, v), BASE);
  }
  assert.equal(shortest(BASE).length, 58); // the base maze: 58 moves from the start to the open space
});

for (const [board, suffix] of [['pmi80', 'pmi80'], ['savia84', 'savia'], ['stone1', 'stone1']]) {
  const profile = BOARD_PROFILES[board];
  const sourceText = fs.readFileSync(new URL(`programs/multi-maze/multi-maze-${suffix}.asm`, root), 'utf8');
  const asm = assemble(sourceText);
  const s = asm.symbols;
  const entry = { id: `multi-maze-${suffix}`, board, format: 'asm', start: board === 'pmi80' ? '1C00' : '1800' };
  const ramOwn = [[s.WORK, s.WORK + 46], [s.VARS, s.VARS_END], [s.STACK_TOP - STACK_BYTES, s.STACK_TOP]];
  const crossKeys = board !== 'stone1' ? { up: ['9', '8'], down: ['1', '2'] } : { up: ['9'], down: ['1'] };
  const VERSION = board === 'pmi80' ? '0.3.0' : '0.2.0';

  test(`${board}: the source assembles inside its RAM, carries the published data and the signature`, () => {
    assert.deepEqual(asm.errors, []);
    assert.equal(s.START, parseInt(entry.start, 16));
    assert.ok(s.CODE_END <= s.WORK && s.WORK + 46 <= s.VARS, 'the image, the maze being played and the variables must not meet');
    assert.ok(s.STACK_TOP - STACK_BYTES >= s.VARS_END, 'the stack must not meet the variables');
    assert.ok(s.STACK_TOP <= (board === 'pmi80' ? 0x1fd5 : 0x1fc8), 'the stack must stay out of the monitor RAM');
    assert.ok(profile.ram[0] <= s.START);
    const image = new Map();
    for (const block of asm.blocks) {
      assert.ok(block.addr >= s.START && block.addr + block.bytes.length <= s.CODE_END);
      block.bytes.forEach((v, i) => image.set(block.addr + i, v));
    }
    const bytes = (from, n) => Array.from({ length: n }, (_, i) => image.get(from + i));
    assert.deepEqual(bytes(s.COLS, 4), BEFORE);
    assert.equal(s.MAZE, s.COLS + 4);
    assert.deepEqual(bytes(s.MAZE, 42), MAZE);
    assert.equal(s.PLACE, s.MAZE + 42);
    assert.deepEqual(bytes(s.PLACE, 8), PLACE);
    assert.deepEqual(bytes(s.POINT1, 8), POINT1);
    assert.deepEqual(bytes(s.POINT2, 8), POINT2);
    const version = sourceText.match(/version (\d+)\.(\d+)\.(\d+):/);
    assert.equal(version[0], `version ${VERSION}:`);
    const signature = Buffer.from(`Wolf2026v${version.slice(1).join('')}`, 'ascii');
    const last = asm.blocks.at(-1);
    assert.equal(last.addr + last.bytes.length, s.CODE_END, 'no emitted bytes may follow the signature');
    assert.deepEqual(Buffer.from(last.bytes.slice(-signature.length)), signature);
    assert.equal(s.SIGNATURE, s.CODE_END - signature.length);
    // Tables read with 8-bit address arithmetic stay within one 256-byte page.
    const samePage = (from, to, what) => assert.equal(from >> 8, to >> 8, `${what} crosses a page`);
    samePage(s.TEXT, s.TEXT + 9, 'TEXT'); samePage(s.TEXT, s.MAZE + 38, 'TEXT and the zeros at MAZE+32');
    samePage(s.WORK, s.WORK + 45, 'WORK'); samePage(s.KEYS, s.KEYS + 12, 'KEYS'); samePage(s.PLACE, s.POINT2 + 7, 'the patches');
    samePage(s.TAB1, s.TAB1 + 7, 'TAB1'); samePage(s.DIGITS, s.DIGITS + 9, 'DIGITS'); samePage(s.DISPLAY, s.BLCNT, 'DISPLAY');
    assert.doesNotMatch(sourceText, /\b(?:JPE|JPO|CPE|CPO|RPE|RPO)\b/);
    assert.match(sourceText, new RegExp(`^; Multi-Maze for the ${board === 'pmi80' ? 'PMI-80' : board === 'savia84' ? 'Savia-84' : 'Stone 1'}, version ${VERSION.replaceAll('.', '\\.')}:`));
    console.log(`${board}: image ${s.START.toString(16)}-${(s.CODE_END - 1).toString(16)} ${s.CODE_END - s.START} B, variables ${s.VARS_END - s.VARS} B, stack below ${s.STACK_TOP.toString(16)}`);
  });

  for (const fw of profile.firmware) test(`${board}/${fw.id}: title, window, moves, walls, patches, the walk to the exit, timing and sound`, () => {
    assert.deepEqual(asm.errors, []);
    const m = fw.create(roms);
    const at = ms => Math.round(ms * profile.clockHz / 1000);
    const ms = states => states * 1000 / profile.clockHz;
    const run = t => m.run(at(t));
    const get = name => m.read(s[name]);
    const bcd = v => (v >> 4) * 10 + (v & 15);
    const getMoves = () => m.read(s.MOVES + 1) * 100 + bcd(m.read(s.MOVES)); // BCD: tens and units, then hundreds
    const shown = () => {
      m.display.takeFrame(m.cycles); run(30);
      return litMasks(m.display.takeFrame(m.cycles), 9);
    };
    const tap = (key, hold = 40) => { m.pressKey(key); run(hold); m.releaseKey(key); run(40); };
    const tapBuild = key => { m.pressKey(key); run(40); m.releaseKey(key); run(400); }; // a generated maze takes a while
    const noBlink = masks => masks.map((v, i) => (i === 5 ? v & ~0x40 : v));

    // Hooks: ownership of RAM, the 8255 outputs, timing events, tones, the random byte
    let active = false, force = null, ownStack = false, minSp = 0xffff;
    const events = [], samples = [], bursts = [], gaps = [], frames = [];
    let tone, silenceStart, winAt, outAt, lastReturn, genAt;
    const genTimes = [];
    const write = m.cpu.bus.write;
    m.cpu.bus.write = (a, v) => {
      if (active) assert.ok(ramOwn.some(([from, to]) => a >= from && a < to), `write outside owned RAM: ${a.toString(16)}`);
      write(a, v);
    };
    const output = m.cpu.bus.output;
    m.cpu.bus.output = (p, v) => {
      if (active && (p & 255) === 0xf8) {
        if (tone) assert.equal(v & 0x40, 0x40, 'g must be off during tones');
        else assert.equal(v & 0x80, 0, 'PA7 must be low outside PMI-80 tones');
        if (board !== 'pmi80') assert.equal(v & 0x80, 0, 'no sound on this board');
      }
      output(p, v);
      if (tone && m.display.digit >= 0) {
        tone.columns.add(m.display.digit);
        assert.equal(m.display.lit & 0x40, 0);
      }
    };
    const step = m.cpu.step.bind(m.cpu);
    m.cpu.step = () => {
      const pc = m.cpu.pc;
      if (pc === s.START) active = true;
      if (active && pc === s.START + 4) ownStack = true;
      if (active) {
        if (pc === s.PATCHES && force !== null) m.cpu.a = force;
        if (pc === s.TITLE || pc === s.TWAIT) events.push([pc, m.cycles, Array.from({ length: 9 }, (_, i) => m.read(s.DISPLAY + i))]);
        if (pc === s.FRAME) frames.push(m.cycles);
        if (pc === s.NOBLINK) samples.push([m.cycles, m.read(s.DISPLAY + 5) & 0x40]);
        if (pc === s.WIN) winAt = m.cycles;
        if (pc === s.SHOWOUT) outAt = m.cycles;
        if (pc === s.GENERATE) genAt = m.cycles;
        if (pc === s.SETUP && genAt !== undefined) { genTimes.push(m.cycles - genAt); genAt = undefined; }
        if (board === 'pmi80') {
          if (pc === s.SOUND_INIT) {
            if (silenceStart !== undefined) { gaps.push(m.cycles - silenceStart); silenceStart = undefined; }
            m.takeAudio(); tone = { start: m.cycles, columns: new Set() };
          }
          if (pc === s.SOUND_RETURN) {
            bursts.push({ ...tone, end: m.cycles, edges: m.takeAudio().edges });
            tone = undefined; lastReturn = m.cycles;
          }
          if (pc === s.SOUND_GAP && silenceStart === undefined) silenceStart = m.cycles;
        }
      }
      const value = step();
      if (active) {
        assert.equal(m.cpu.halted, false);
        assert.ok(m.cpu.pc >= s.START && m.cpu.pc < s.CODE_END, `left the image: ${m.cpu.pc.toString(16)}`);
        if (ownStack) minSp = Math.min(minSp, m.cpu.sp);
      }
      return value;
    };
    const checkTone = (burst, hz) => {
      const duration = ms(burst.end - burst.start);
      assert.ok(Math.abs(duration - 30) < 1, `tone duration ${duration} ms`);
      assert.equal(burst.edges.length, hz === 1000 ? 60 : 30);
      for (let k = 1; k < burst.edges.length - 1; k++) {
        const dt = burst.edges[k] - burst.edges[k - 1];
        assert.ok(Math.abs(dt * 2 * hz / profile.clockHz - 1) < 0.01, `half-period ${dt} states`);
      }
      assert.equal(burst.columns.size, 9, 'all digits must be refreshed during tones');
    };

    // ---- Start as the side panel does it; the title scrolls and repeats
    startProgram(m, entry, Buffer.from(sourceText), { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys });
    assert.equal(get('STATE'), 2);
    assert.deepEqual(shown(), [0, 0, ...TITLE.slice(0, 7)]);
    run(4200);
    // TITLE once per round, TWAIT once per window: four text windows and the dark one
    const marks = events.map(([pc, t]) => [pc === s.TITLE ? 'T' : 'W', t]);
    assert.deepEqual(marks.slice(0, 8).map(e => e[0]).join(''), 'TWWWWWTW');
    const gap = k => ms(marks[k + 1][1] - marks[k][1]);
    const near = (value, want, tol, what) => assert.ok(Math.abs(value - want) <= tol, `${what}: ${value.toFixed(1)} ms, wanted ${want}`);
    near(gap(1), 1500, 30, 'first window');
    near(gap(2), 250, 8, 'step 1');
    near(gap(3), 250, 8, 'step 2');
    near(gap(4), 1000, 20, 'last window');
    near(gap(5), 400, 8, 'dark');
    // Every title window shows the text shifted by one character, then the display is dark.
    [0, 1, 2, 3].forEach(k => assert.deepEqual(events[1 + k][2], [0, 0, ...TITLE.slice(k, k + 7)], `title window ${k}`));
    assert.deepEqual(events[5][2], Array(9).fill(0), 'dark window');
    const deltas = frames.slice(1, 400).map((t, k) => ms(t - frames[k]));
    near(deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)], 5.5, 0.1, 'display frame');

    // ---- A key ends the title and is not a move; the maze is the base maze (patch byte 0)
    force = 0;
    m.pressKey('9');
    run(60);
    assert.equal(get('STATE'), 0);
    assert.equal(get('PX'), 3);
    assert.equal(get('PY'), 6);
    assert.equal(getMoves(), 0);
    m.releaseKey('9'); run(40);
    let maze = BASE;
    const ramMaze = () => Array.from({ length: 46 }, (_, i) => m.read(s.WORK + i));
    assert.deepEqual(ramMaze(), maze);
    let p = 1, row = 6, moves = 0;
    const check = what => {
      assert.equal(get('PX'), p + 2, `${what}: column`);
      assert.equal(get('PY'), row, `${what}: row`);
      assert.equal(getMoves(), moves, `${what}: moves`);
      assert.deepEqual(noBlink(shown()), noBlink(windowOf(maze, p, row)), `${what}: window`);
      assert.deepEqual(ramMaze(), maze);
    };
    check('start');
    // The start window of the original, from the specification's map: rows 5-7 of columns 4 ... -2
    // Read by hand from the specification's map (rows 5-7, columns 4, 3, 2, 1, 0, -1, -2):
    // a wall under, walls over and under (twice), a wall over, three walls, a wall in the row, free
    const startWindow = [0, 0, 0x08, 0x09, 0x09, 0x01, 0x49, 0x40, 0x00];
    assert.deepEqual(windowOf(BASE, 1, 6), startWindow);
    assert.deepEqual(noBlink(shown()), startWindow);

    // ---- The player blinks every 77 ms and starts dark after a move
    const blinkFrom = samples.length;
    run(700);
    const flips = [];
    for (let k = blinkFrom + 1; k < samples.length; k++) if (samples[k][1] !== samples[k - 1][1]) flips.push(samples[k][0]);
    assert.ok(flips.length >= 8, `${flips.length} flips`);
    for (let k = 1; k < flips.length; k++) near(ms(flips[k] - flips[k - 1]), 77, 7.7, `blink ${k}`);
    // The moves of the keys, one at a time, against the model, with bumps into walls
    const tryMove = (dir, keyIndex = 0) => {
      const [dk, dr] = MOVE_KEYS[dir];
      const key = (crossKeys[dir] ?? [MOVE_KEYS[dir][2]])[keyIndex] ?? MOVE_KEYS[dir][2];
      const blocked = wall(maze, p + dk, row + dr);
      const before = bursts.length;
      tap(key);
      if (!blocked) { p += dk; row += dr; moves++; }
      check(`${dir} by ${key}${blocked ? ' (wall)' : ''}`);
      if (board === 'pmi80' && blocked) {
        assert.equal(bursts.length, before + 1, 'a wall gives one tone');
        checkTone(bursts.at(-1), 500);
      } else assert.equal(bursts.length, before);
      return blocked;
    };
    // The start has a wall on the right (column 0 is solid): a bump is not counted
    assert.equal(tryMove('right'), true);
    let bumps = 1;
    let rng = 12345;
    const dirs = Object.keys(MOVE_KEYS);
    for (let n = 0; n < 70; n++) {
      rng = (rng * 1103515245 + 12345) >>> 0;
      const dir = dirs[(rng >>> 16) % 4];
      if (tryMove(dir, (rng >>> 20) & 1)) bumps++;
    }
    assert.ok(bumps >= 3 && moves >= 15, `${bumps} bumps, ${moves} moves`);
    // After the first blink after a move the player is dark first
    tap(crossKeys.up[0]);
    {
      const [dk, dr] = MOVE_KEYS.up;
      if (!wall(maze, p + dk, row + dr)) { p += dk; row += dr; moves++; }
    }
    check('one more');

    // Keys without a task do nothing, a held key moves once
    const idle = ['0', '2', '3', '5', '7', '8', 'A', 'B', 'C', 'D', 'E', 'F', 'M', 'L', 'R', 'BR', 'EX'];
    for (const key of idle) {
      if (crossKeys.up.length > 1 && (key === '8' || key === '2')) continue;
      tap(key);
    }
    check('idle keys');
    if (crossKeys.up.length === 1) for (const key of ['8', '2']) { tap(key); check(`key ${key} is not a move here`); }
    const freeDir = dirs.find(d => !wall(maze, p + MOVE_KEYS[d][0], row + MOVE_KEYS[d][1]));
    m.pressKey(MOVE_KEYS[freeDir][2]); run(400); m.releaseKey(MOVE_KEYS[freeDir][2]); run(40);
    p += MOVE_KEYS[freeDir][0]; row += MOVE_KEYS[freeDir][1]; moves++;
    check('held key, one move');
    // A key pressed while another is held does not move, and a key needs a release first
    const freeDir2 = dirs.find(d => !wall(maze, p + MOVE_KEYS[d][0], row + MOVE_KEYS[d][1]));
    m.pressKey('5'); run(40);
    m.pressKey(MOVE_KEYS[freeDir2][2]); run(40);
    check('second key while another is down');
    m.releaseKey(MOVE_KEYS[freeDir2][2]); m.releaseKey('5'); run(40);

    // ---- Moves are capped at 999
    m.write(s.MOVES, 0x98); m.write(s.MOVES + 1, 9); moves = 998;
    for (let n = 0; n < 2; n++) {
      const dir = dirs.find(d => !wall(maze, p + MOVE_KEYS[d][0], row + MOVE_KEYS[d][1]));
      tap(MOVE_KEYS[dir][2]); p += MOVE_KEYS[dir][0]; row += MOVE_KEYS[dir][1]; moves = Math.min(moves + 1, 999);
      check('cap');
    }
    assert.equal(getMoves(), 999);

    // ---- New maze with all eight patches: = / dA; the changes are cumulative and undone by the same byte
    force = 0xff;
    tap('=');
    maze = patched(maze, 0xff);
    p = 1; row = 6; moves = 0;
    assert.notDeepEqual(maze, BASE);
    check('new maze, all patches');
    tap('=');
    maze = patched(maze, 0xff);
    check('the same byte undoes it');
    assert.deepEqual(maze, BASE);
    force = 0x5a;
    tap('=');
    maze = patched(maze, 0x5a);
    check('patch byte 5A');

    // ---- The walk to the exit by a shortest path (on this variant), then OUt and the moves
    const path = shortest(maze);
    const before = bursts.length;
    path.forEach((key, i) => {
      tap(crossKeys[Object.keys(MOVE_KEYS).find(d => MOVE_KEYS[d][2] === key)]?.[i & 1 && crossKeys.up.length > 1 ? 1 : 0] ?? key);
    });
    assert.equal(get('STATE'), 1, 'the exit was reached');
    assert.equal(getMoves(), path.length);
    assert.equal(get('PX'), 17);
    // open space: the window shows free columns on the left, moves are ignored
    run(300);
    assert.deepEqual(noBlink(shown()), noBlink(windowOf(maze, 15, get('PY'))));
    tap('4'); tap('1'); tap('9'); tap('6');
    assert.equal(get('PX'), 17);
    assert.equal(getMoves(), path.length);
    if (board === 'pmi80') {
      assert.equal(bursts.length, before + 2, 'two tones at the exit');
      checkTone(bursts.at(-2), 1000); checkTone(bursts.at(-1), 1000);
      near(ms(gaps.at(-1)), 40, 1, 'pause between the tones');
    }
    run(900);
    assert.equal(get('STATE'), 2);
    const digits = String(path.length).split('').map(c => DIGITS[+c]);
    assert.deepEqual(shown(), [0, 0, 0x3f, 0x3e, 0x78, 0, ...Array(3 - digits.length).fill(0), ...digits]);
    near(ms(outAt - (board === 'pmi80' ? lastReturn : winAt)), 1000, 40, 'open space time');
    // after OUt only the new-maze key does anything
    for (const key of ['9', '1', '4', '6', '5']) tap(key);
    assert.equal(get('STATE'), 2);
    assert.deepEqual(shown(), [0, 0, 0x3f, 0x3e, 0x78, 0, ...Array(3 - digits.length).fill(0), ...digits]);
    force = 0;
    tap('=');
    maze = patched(maze, 0);
    p = 1; row = 6; moves = 0;
    assert.equal(get('STATE'), 0);
    check('new maze after the exit');

    // ---- The random byte comes from the waiting time: different waits, different patch bytes
    force = null;
    const seen = new Set();
    for (let k = 0; k < 14; k++) {
      run(7 + k * 5.3);
      tap('=');
      const next = ramMaze();
      const v = patchByte(maze, next);
      assert.deepEqual(next, patched(maze, v), 'only the patches change the maze');
      seen.add(v);
      maze = next;
      assert.ok(shortest(maze), 'the new maze can be solved');
    }
    assert.ok(seen.size >= 8, `${seen.size} different patch bytes`);

    // ---- S switches to generated mazes for good; then = and S both build a new one
    tapBuild('S');
    maze = ramMaze(); p = 1; row = 6; moves = 0;
    checkGenerated(maze, 'the first generated maze');
    check('the first generated maze');
    const genPath = shortest(maze);
    genPath.forEach(key => tap(key));
    assert.equal(get('STATE'), 1, 'the exit of a generated maze was reached');
    assert.equal(getMoves(), genPath.length);
    run(1300);
    assert.equal(get('STATE'), 2);
    const mazes = new Set([maze.join()]);
    for (let k = 0; k < 12; k++) {
      run(7 + k * 5.3);
      tapBuild(k & 1 ? 'S' : '=');
      maze = ramMaze(); p = 1; row = 6; moves = 0;
      checkGenerated(maze, `generated maze ${k + 2}`);
      check(`generated maze ${k + 2}`);
      mazes.add(maze.join());
    }
    assert.equal(mazes.size, 13, 'every generated maze is new');
    assert.equal(get('ORIGINAL'), 0);
    assert.deepEqual(Array.from({ length: 46 }, (_, i) => m.read(s.COLS + i)), BASE, 'the published maze stays in the image');
    const genMs = Math.max(...genTimes.map(ms));
    assert.ok(genTimes.length === 13 && genMs < 300, `building a maze takes ${genMs.toFixed(1)} ms`);
    assert.ok(minSp >= s.STACK_TOP - STACK_BYTES, `stack low-water mark ${minSp.toString(16)}`);
    console.log(`${board}/${fw.id}: frame ${(deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)]).toFixed(3)} ms, title ${[1, 2, 3, 4, 5].map(k => gap(k).toFixed(1)).join('/')} ms, ${path.length} moves to the exit, ${seen.size} patch bytes, ${mazes.size} generated mazes built in at most ${genMs.toFixed(1)} ms, min SP ${minSp.toString(16)}`);
  });

  test(`${board}: S at the title starts the generated mazes`, () => {
    const fw = profile.firmware[0];
    const m = fw.create(roms);
    const at = ms => Math.round(ms * profile.clockHz / 1000);
    startProgram(m, entry, Buffer.from(sourceText), { bootStates: at(profile.bootMs), holdStates: at(fw.holdMs), runKeys: fw.runKeys });
    m.run(at(700));
    m.pressKey('S'); m.run(at(300)); m.releaseKey('S'); m.run(at(40));
    assert.equal(m.read(s.STATE), 0);
    assert.equal(m.read(s.ORIGINAL), 0);
    checkGenerated(Array.from({ length: 46 }, (_, i) => m.read(s.WORK + i)), 'a maze from the title');
  });
}
